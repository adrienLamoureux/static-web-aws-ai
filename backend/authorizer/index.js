const { CognitoJwtVerifier } = require("aws-jwt-verify");

let verifier = null;
const getVerifier = () => {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: process.env.USER_POOL_ID,
      tokenUse: "id",
      clientId: null,
    });
  }
  return verifier;
};

const extractBearerToken = (header = "") => {
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
};

const generatePolicy = (principalId, effect, resource, context) => {
  const arnParts = resource.split(":");
  const apiParts = arnParts[5].split("/");
  const wildcardArn = `${arnParts.slice(0, 5).join(":")}:${apiParts[0]}/${apiParts[1]}/*/*`;
  return {
    principalId,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [{ Action: "execute-api:Invoke", Effect: effect, Resource: wildcardArn }],
    },
    context,
  };
};

exports.handler = async (event) => {
  const methodArn = event.methodArn;
  const authHeader =
    (event.headers && (event.headers.Authorization || event.headers.authorization)) || "";
  const token = extractBearerToken(authHeader);

  if (!token) {
    return generatePolicy("anonymous", "Allow", methodArn, {
      anonymous: "true",
      sub: "",
      email: "",
      groups: "",
    });
  }

  try {
    const payload = await getVerifier().verify(token);
    const rawGroups = payload["cognito:groups"];
    const groups = Array.isArray(rawGroups) ? rawGroups.join(",") : "";
    return generatePolicy(payload.sub, "Allow", methodArn, {
      anonymous: "false",
      sub: payload.sub,
      email: payload.email || "",
      groups,
    });
  } catch (err) {
    return generatePolicy("user", "Deny", methodArn, {});
  }
};
