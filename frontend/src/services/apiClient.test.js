import { fetchJson, postJson, deleteJson } from "./apiClient";

// Mock getAuthToken so we can control the token in tests
jest.mock("../utils/authTokens", () => ({
  getAuthToken: jest.fn(() => ""),
}));

import { getAuthToken } from "../utils/authTokens";

function makeFetchResponse({ status = 200, ok = true, body = null }) {
  return Promise.resolve({
    status,
    ok,
    json: () => Promise.resolve(body),
  });
}

describe("fetchJson", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    getAuthToken.mockReturnValue("");
  });

  it("returns parsed JSON on a 200 response", async () => {
    const data = { result: "ok" };
    jest
      .spyOn(global, "fetch")
      .mockReturnValue(makeFetchResponse({ status: 200, ok: true, body: data }));

    const result = await fetchJson("https://example.com/api/test");
    expect(result).toEqual(data);
  });

  it("dispatches whisk:auth:expired event on a 401 response", async () => {
    jest
      .spyOn(global, "fetch")
      .mockReturnValue(
        makeFetchResponse({ status: 401, ok: false, body: { message: "Unauthorized" } })
      );

    const handler = jest.fn();
    window.addEventListener("whisk:auth:expired", handler);

    await expect(fetchJson("https://example.com/api/test")).rejects.toThrow();
    expect(handler).toHaveBeenCalledTimes(1);

    window.removeEventListener("whisk:auth:expired", handler);
  });

  it("throws with error message on a 500 response", async () => {
    jest
      .spyOn(global, "fetch")
      .mockReturnValue(
        makeFetchResponse({ status: 500, ok: false, body: { message: "Internal Server Error" } })
      );

    await expect(fetchJson("https://example.com/api/test")).rejects.toThrow(
      "Internal Server Error"
    );
  });

  it("uses fallback error message when body has no message", async () => {
    jest
      .spyOn(global, "fetch")
      .mockReturnValue(makeFetchResponse({ status: 500, ok: false, body: {} }));

    await expect(fetchJson("https://example.com/api/test", {}, "Custom error")).rejects.toThrow(
      "Custom error"
    );
  });

  it("attaches status, errorCode, and body to the thrown error", async () => {
    jest.spyOn(global, "fetch").mockReturnValue(
      makeFetchResponse({
        status: 404,
        ok: false,
        body: { error: "agent_mode_disabled" },
      })
    );

    let captured = null;
    try {
      await fetchJson("https://example.com/api/agent/turn");
    } catch (err) {
      captured = err;
    }
    expect(captured).not.toBeNull();
    expect(captured.status).toBe(404);
    expect(captured.errorCode).toBe("agent_mode_disabled");
    expect(captured.body).toEqual({ error: "agent_mode_disabled" });
  });

  it("includes Authorization header when auth token is present", async () => {
    getAuthToken.mockReturnValue("my-token");
    const data = { ok: true };
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockReturnValue(makeFetchResponse({ status: 200, ok: true, body: data }));

    await fetchJson("https://example.com/api/test");

    const calledOptions = fetchSpy.mock.calls[0][1];
    expect(calledOptions.headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer my-token" })
    );
  });

  it("does not include Authorization header when no auth token", async () => {
    getAuthToken.mockReturnValue("");
    const data = { ok: true };
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockReturnValue(makeFetchResponse({ status: 200, ok: true, body: data }));

    await fetchJson("https://example.com/api/test");

    const calledOptions = fetchSpy.mock.calls[0][1];
    expect(calledOptions.headers?.Authorization).toBeUndefined();
  });
});

describe("postJson", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    getAuthToken.mockReturnValue("");
  });

  it("sends a POST with JSON body and Content-Type header", async () => {
    const responseData = { created: true };
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockReturnValue(makeFetchResponse({ status: 200, ok: true, body: responseData }));

    const payload = { name: "test" };
    const result = await postJson("https://example.com/api/resource", payload);

    expect(result).toEqual(responseData);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://example.com/api/resource");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual(
      expect.objectContaining({ "Content-Type": "application/json" })
    );
    expect(options.body).toBe(JSON.stringify(payload));
  });

  it("includes Authorization header when token is set", async () => {
    getAuthToken.mockReturnValue("auth-token-123");
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockReturnValue(makeFetchResponse({ status: 200, ok: true, body: {} }));

    await postJson("https://example.com/api/resource", {});

    const calledOptions = fetchSpy.mock.calls[0][1];
    expect(calledOptions.headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer auth-token-123" })
    );
  });
});

describe("deleteJson", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sends a DELETE request", async () => {
    const responseData = { deleted: true };
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockReturnValue(makeFetchResponse({ status: 200, ok: true, body: responseData }));

    const result = await deleteJson("https://example.com/api/resource/1");

    expect(result).toEqual(responseData);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://example.com/api/resource/1");
    expect(options.method).toBe("DELETE");
  });

  it("throws on a failed DELETE request", async () => {
    jest
      .spyOn(global, "fetch")
      .mockReturnValue(
        makeFetchResponse({ status: 404, ok: false, body: { message: "Not Found" } })
      );

    await expect(deleteJson("https://example.com/api/resource/999")).rejects.toThrow("Not Found");
  });
});
