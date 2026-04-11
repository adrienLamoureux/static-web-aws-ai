# 3-Tier Permission System — Implementation Plan

> **Status:** Ready for implementation
> **Created:** 2026-03-24
> **Agent-resumable:** Yes — an implementing agent should read this file end-to-end before starting.

## Context

The application currently has a binary auth model: either you have a valid Cognito JWT or you are rejected. There are no roles, no public routes, no admin guards. Every HTTP request through API Gateway requires a Cognito token, making anonymous access impossible. The Director/Sanctum area is accessible to any authenticated user.

**Goal:** Establish 3 permission tiers — Public, User, Admin — with a login modal for graceful Public→User transitions.

**Branch rules:**
- Backend + CDK changes → `codex/dev`
- Frontend/UI changes → Sakura worktree (`/Users/adrienlamoureux/Documents/code/wt/design-sakura/code/`)

**Decisions made:**
- API Gateway strategy: **Request Authorizer Lambda** (replaces Cognito authorizer)
- Public pages: **Home (/), Gallery (/gallery), About (/about)**
- Login UX: **Overlay modal + Cognito redirect** (preserves page context)

---

## Step 1 — CDK: Cognito Groups + Request Authorizer

**File:** `cdk/lib/static-web-aws-ai-stack.ts`

### 1a. Create Cognito groups (after userPool declaration, ~line 156)

```ts
new cognito.CfnUserPoolGroup(this, "AdminGroup", {
  groupName: "admin",
  userPoolId: userPool.userPoolId,
  description: "Administrators with access to Director/Sanctum",
  precedence: 0,
});
```

### 1b. Add admin users to the "admin" group

After each `registerDefaultAdminUser` call (~lines 261–271), add a new `AwsCustomResource` calling `adminAddUserToGroup` with `GroupName: "admin"`. Add `cognito-idp:AdminAddUserToGroup` to the IAM policy.

### 1c. New Request Authorizer Lambda

Replace the `CognitoUserPoolsAuthorizer` (lines 370–375) with a custom `RequestAuthorizer`:

```ts
const authorizerLambda = new lambda.Function(this, "AuthorizerLambda", {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: "index.handler",
  code: lambda.Code.fromAsset(path.join(__dirname, "../../backend/authorizer")),
  environment: { USER_POOL_ID: userPool.userPoolId },
});

const requestAuthorizer = new apigateway.RequestAuthorizer(this, "RequestAuthorizer", {
  handler: authorizerLambda,
  identitySources: [],          // allows anonymous requests through
  resultsCacheTtl: cdk.Duration.seconds(0),
});
```

Update `defaultMethodOptions` to `AuthorizationType.CUSTOM` + `requestAuthorizer`.

### 1d. New file: `backend/authorizer/index.js` + `package.json`

~40-line Lambda using `aws-jwt-verify`:
- **No token** → Allow with `context: { anonymous: "true", sub: "", groups: "" }`
- **Valid JWT** → Allow with `context: { anonymous: "false", sub, email, groups: "admin,user" }`
- **Invalid/expired JWT** → Deny (401)

---

## Step 2 — Backend: Auth Middleware Refactor

**File:** `backend/lib/auth.js`

### 2a. Update `getUserFromRequest`

Read from REQUEST authorizer context (`req.apiGateway.event.requestContext.authorizer`) instead of `.authorizer.claims`. Return `{ sub, email, groups: string[], anonymous: boolean }`. Keep backward compat with old Cognito claims path + dev fallback.

### 2b. Add three middleware functions

```js
// Attaches req.user for all requests (null for anonymous). Never rejects.
const optionalUserMiddleware = (req, res, next) => { ... };

// Rejects if no req.user.sub → 401
const requireUserMiddleware = (req, res, next) => { ... };

// Rejects if !req.user.groups.includes("admin") → 403
const requireAdminMiddleware = (req, res, next) => { ... };
```

Remove the path-based skipping (`req.path === "/" || req.path === "/health"`) from the old `requireUserMiddleware` — that's now handled by the authorizer + per-route middleware.

### 2c. Update exports

```js
module.exports = {
  decodeJwtPayload, getUserFromRequest,
  optionalUserMiddleware, requireUserMiddleware, requireAdminMiddleware,
};
```

---

## Step 3 — Backend: DI + Global Middleware

**File:** `backend/lib/build-deps.js` (line 63, 244)

Add `optionalUserMiddleware` and `requireAdminMiddleware` to the deps object alongside existing `requireUserMiddleware`.

**File:** `backend/index.js` (line 29)

```diff
- app.use(deps.requireUserMiddleware);
+ app.use(deps.optionalUserMiddleware);
```

---

## Step 4 — Backend: Route-Level Permission Guards

### 4a. Public routes (no middleware needed)

| Route | File | Notes |
|-------|------|-------|
| `GET /` | `core-prompt.js` | Already no userId check |
| `GET /health` | `core-prompt.js` | Already no userId check |
| `GET /story/presets` | `story-session-routes.js` | Shared catalog data |
| `GET /story/characters` | `story-session-routes.js` | Shared catalog data |
| `GET /prompt-helper/options` | `core-prompt.js` | Shared seed data |
| `GET /s3/shared/images` | `media-routes.js` | Remove userId guard — queries SHARED prefix |
| `GET /s3/shared/videos` | `media-routes.js` | Remove userId guard — queries SHARED prefix |

### 4b. Admin-only routes — add `[requireUserMiddleware, requireAdminMiddleware]`

**File:** `backend/routes/operations-routes.js`

All `/ops/*` endpoints get admin guard:
- `GET /ops/dashboard`
- `GET/POST /ops/director/config`
- `GET/POST /ops/director/app-config`
- `GET /ops/director/masonry/images`, `POST .../upload-url`, `POST .../delete`
- `GET /ops/director/overview`
- `POST /ops/director/jobs/prioritize`
- `POST /ops/director/story/sessions/pin`
- `POST /ops/director/sound/normalize`

### 4c. User-only routes — add `requireUserMiddleware` per-handler

All remaining route files need `requireUserMiddleware` applied to each handler since global middleware no longer blocks anonymous users:

| File | Pattern |
|------|---------|
| `media-routes.js` | All non-shared routes (image uploads, video ops, favorites) |
| `bedrock-routes.js` | All routes |
| `bedrock-image-video-route.js` | All routes |
| `replicate-image-routes.js` | All routes |
| `replicate-image-status-select-routes.js` | All routes |
| `replicate-video-routes.js` | All routes |
| `civitai-image-routes.js` | All routes |
| `gradio-routes.js` | All routes |
| `story-session-routes.js` | All except presets/characters (public) |
| `story-message-route.js` | All routes |
| `story-illustration-route.js` | All routes |
| `lora-routes.js` | All routes |
| `character-routes.js` | All routes |

**Pattern:** `app.get("/path", requireUserMiddleware, async (req, res) => { ... })`

---

## Step 5 — Frontend: Extract Roles from JWT

**File:** `frontend/src/utils/authTokens.js` (line 85–94)

```diff
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
+   groups: Array.isArray(payload["cognito:groups"]) ? payload["cognito:groups"] : [],
+   isAdmin: (payload["cognito:groups"] || []).includes("admin"),
  };
```

**File:** `frontend/src/contexts/AuthContext.js` — no structural changes needed. The `user` object from `getUserFromIdToken` will now carry `groups` and `isAdmin` automatically.

---

## Step 6 — Frontend: Login Modal Component

**New file:** `frontend/src/components/auth/LoginModal.js`

Overlay modal with:
- Translucent backdrop (`backdrop-filter: blur(4px)`)
- Centered card with Sakura styling
- "Sign in to continue" heading + contextual message
- "Sign in with Cognito" button → calls `startLogin(currentPath)`
- "Continue browsing" button → closes modal
- Close button (×)

**New file:** `frontend/src/hooks/useLoginPrompt.js`

```js
export function useLoginPrompt() {
  const { isAuthenticated } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [loginMessage, setLoginMessage] = useState("");

  const requireAuth = useCallback((message = "") => {
    if (isAuthenticated) return true;
    setLoginMessage(message);
    setShowLogin(true);
    return false;
  }, [isAuthenticated]);

  return { showLogin, loginMessage, requireAuth, closeLogin: () => setShowLogin(false) };
}
```

**CSS:** Add modal styles to Sakura design system CSS (existing stylesheet).

---

## Step 7 — Frontend: Routing + Navigation

**File:** `frontend/src/App.js`

### 7a. Public routes — unwrap from ProtectedRoute

```jsx
<Route path="/" element={<HomePage />} />
<Route path="/gallery" element={<SharedLibrary />} />
<Route path="/about" element={<AboutPage />} />
```

### 7b. Admin route guard — new AdminRoute component

```jsx
function AdminRoute({ children }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!user?.isAdmin) return <Navigate to="/" replace />;
  return children;
}
```

Apply to `/sanctum` routes:
```jsx
<Route path="/sanctum" element={<AdminRoute><Director /></AdminRoute>} />
<Route path="/sanctum/sounds" element={<AdminRoute><StoryMusicLibrary /></AdminRoute>} />
<Route path="/sanctum/lora" element={<AdminRoute><LoraManagement /></AdminRoute>} />
```

### 7c. Conditional navigation (NAV_ITEMS)

```js
const NAV_ITEMS = [
  { label: "Realm",     path: "/",          icon: "✦", public: true },
  { label: "Atelier",   path: "/atelier",   icon: "◈", public: false },
  { label: "Chronicle", path: "/chronicle",  icon: "▤", public: false },
  { label: "Gallery",   path: "/gallery",   icon: "◻", public: true },
  { label: "Sanctum",   path: "/sanctum",   icon: "⚙", requiredRole: "admin" },
];
```

Filter in SakuraShell:
```js
const visibleNavItems = NAV_ITEMS.filter((item) => {
  if (item.requiredRole === "admin" && !user?.isAdmin) return false;
  if (!item.public && !isAuthenticated) return false;
  return true;
});
```

### 7d. SakuraShell: always-visible topbar + HUD

- **Topbar** (line 130): Remove `{isAuthenticated && ...}` gate. Show "Sign in" button when not authenticated, user email + "Sign out" when authenticated.
- **HUD** (line 166): Remove `{isAuthenticated && ...}` gate. Render `visibleNavItems` instead of all `NAV_ITEMS`.

### 7e. ProtectedRoute update

Keep for `/atelier` and `/chronicle`. Change to show login modal instead of redirect:

```jsx
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading, startLogin } = useAuth();
  const location = useLocation();
  if (isLoading) return null;
  if (!isAuthenticated) {
    // Show login modal over a placeholder, preserving current URL
    return <LoginModal isOpen message="Sign in to access this feature"
              onClose={() => window.history.back()} />;
  }
  return children;
}
```

---

## Step 8 — Frontend: Login Modal Integration in Public Pages

In `HomePage` and `SharedLibrary` (Gallery), use the `useLoginPrompt` hook to intercept authenticated actions (e.g., "Create", "Favorite") with the modal:

```jsx
const { showLogin, loginMessage, requireAuth, closeLogin } = useLoginPrompt();

const handleCreate = () => {
  if (!requireAuth("Sign in to create content")) return;
  // proceed...
};

return (
  <>
    {/* page content */}
    <LoginModal isOpen={showLogin} onClose={closeLogin} message={loginMessage} />
  </>
);
```

---

## Migration & Backward Compatibility

| Scenario | Behavior |
|----------|----------|
| Existing user (no Cognito group) | `groups: []`, can access User routes, blocked from Admin routes |
| Admin user (in "admin" group) | `groups: ["admin"]`, full access |
| Anonymous visitor | `req.user = null`, public routes only |
| Token refresh | New id_token includes current `cognito:groups` — no stale roles |
| Non-admin hits `/sanctum` | Frontend: AdminRoute redirects to `/`. Backend: 403 |
| Anonymous hits `/chronicle` | Frontend: LoginModal appears. Backend: 401 if API called directly |

---

## Deployment Order

1. **CDK + Backend together** — Deploy authorizer Lambda, Cognito groups, admin group membership, and updated Express middleware in one `cdk deploy`. The updated `getUserFromRequest` handles both old claims and new authorizer context.
2. **Frontend** — Deploy after backend is stable. Changes are purely additive.

---

## Verification Plan

### Backend
1. `npm test` in `backend/` (existing auth tests)
2. Manual curl tests:
   - `curl GET /health` — no token → 200
   - `curl GET /s3/shared/images` — no token → 200
   - `curl GET /story/sessions` — no token → 401
   - `curl GET /story/sessions` — valid user token → 200
   - `curl GET /ops/dashboard` — user token (no admin group) → 403
   - `curl GET /ops/dashboard` — admin token → 200
3. Update `backend/test/auth.test.js` with tests for `optionalUserMiddleware`, `requireAdminMiddleware`

### Frontend
1. Open app unauthenticated → see Home, Gallery, About in HUD, no Sanctum
2. Browse Gallery → content loads without login
3. Click "Atelier" in HUD (or nav to `/atelier`) → login modal appears
4. Click "Sign in" → Cognito redirect → after callback, land on `/atelier`
5. Log in as non-admin → Sanctum not in HUD, direct `/sanctum` URL → redirected to `/`
6. Log in as admin → Sanctum visible, Director page loads

### Playwright smoke (optional)
- Public gallery page loads without auth
- Protected route shows login modal
- Admin route hidden for non-admin users

---

## Files Changed Summary

### `codex/dev` branch (backend + CDK)
| File | Action |
|------|--------|
| `backend/authorizer/index.js` | **New** — Request authorizer Lambda |
| `backend/authorizer/package.json` | **New** — `aws-jwt-verify` dependency |
| `backend/lib/auth.js` | **Modify** — new middlewares, updated getUserFromRequest |
| `backend/lib/build-deps.js` | **Modify** — add new middleware to deps |
| `backend/index.js` | **Modify** — swap global middleware |
| `backend/routes/operations-routes.js` | **Modify** — add admin guards |
| `backend/routes/media-routes.js` | **Modify** — public shared routes, user guards on rest |
| `backend/routes/story-session-routes.js` | **Modify** — user guards on non-public routes |
| `backend/routes/core-prompt.js` | **Modify** — verify public routes stay open |
| All other route files (10 files) | **Modify** — add `requireUserMiddleware` per-handler |
| `cdk/lib/static-web-aws-ai-stack.ts` | **Modify** — groups, authorizer Lambda, admin group membership |
| `backend/test/auth.test.js` | **Modify** — tests for new middlewares |

### Sakura worktree (frontend only)
| File | Action |
|------|--------|
| `frontend/src/utils/authTokens.js` | **Modify** — extract groups/isAdmin from JWT |
| `frontend/src/components/auth/LoginModal.js` | **New** — login modal component |
| `frontend/src/hooks/useLoginPrompt.js` | **New** — hook for triggering modal |
| `frontend/src/App.js` | **Modify** — public routes, AdminRoute, conditional nav, topbar |
| Sakura CSS file | **Modify** — modal overlay styles |

---

## Key Existing Code to Reuse

| What | Where | How |
|------|-------|-----|
| `getUserFromRequest` | `backend/lib/auth.js:28` | Extend, don't replace — add groups extraction |
| `decodeJwtPayload` | `backend/lib/auth.js:13` | Reuse in dev fallback path |
| DI pattern | `backend/lib/build-deps.js:123` | Add new middleware to existing deps object |
| `parseJwt` | `frontend/src/utils/authTokens.js:13` | Already used by `getUserFromIdToken` |
| `startLogin(redirectTo)` | `frontend/src/contexts/AuthContext.js:62` | Already saves redirect path — reuse in modal |
| `useAuth()` hook | `frontend/src/contexts/AuthContext.js:189` | Already provides `isAuthenticated`, `user` |
| `withAuthHeaders` | `frontend/src/services/apiClient.js:24` | Already handles missing token (returns headers as-is) |
| Sakura card styles | Existing CSS | Reuse `skr-card`, `skr-btn-primary`, `skr-btn-ghost` for modal |
