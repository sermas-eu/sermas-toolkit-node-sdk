import axios from "axios";
import {
  clearTokenCache,
  getAvatarToken,
  getAvatarTokenWithClientSecret,
} from "./auth.js";

vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, post: vi.fn() } };
});

const post = vi.mocked(axios.post);
const token = (name: string, expiresIn = 300) => ({
  data: {
    access_token: name,
    refresh_token: `${name}-refresh`,
    expires_in: expiresIn,
  },
});
const config = {
  PUBLIC_AUTH_URL: "http://kc",
  PUBLIC_AUTH_REALM: "r",
  PRIVATE_AUTH_CLIENT_ID: "kiosk",
  PRIVATE_AUTH_CLIENT_SECRET: "s3cr3t",
  PRIVATE_API_BASE_URL: "http://api",
};

describe("getAvatarToken", () => {
  beforeEach(() => {
    clearTokenCache();
    post.mockReset();
    vi.useRealTimers();
  });

  it("mints the app token with the client's service account token", async () => {
    post
      .mockResolvedValueOnce(token("client"))
      .mockResolvedValueOnce(token("app"));
    const res = await getAvatarToken("app1", config);
    expect(res).toMatchObject({
      appId: "app1",
      accessToken: "app",
      refreshToken: "app-refresh",
    });
    const [kcUrl, kcBody] = post.mock.calls[0];
    expect(kcUrl).toBe("http://kc/realms/r/protocol/openid-connect/token");
    expect(String(kcBody)).toContain("grant_type=client_credentials");
    const [apiUrl, apiBody, apiOptions] = post.mock.calls[1];
    expect(apiUrl).toBe("http://api/platform/token");
    expect(apiBody).toEqual({ appId: "app1", clientId: "avatar" });
    expect(apiOptions?.headers).toEqual({ Authorization: "Bearer client" });
  });

  it("reuses tokens across calls until they near expiry", async () => {
    vi.useFakeTimers();
    post
      .mockResolvedValueOnce(token("client"))
      .mockResolvedValueOnce(token("app"));
    await getAvatarToken("app1", config);
    await getAvatarToken("app1", config);
    expect(post).toHaveBeenCalledTimes(2);

    // 300 s tokens are refreshed 30 s before they expire
    vi.advanceTimersByTime(271 * 1000);
    post
      .mockResolvedValueOnce(token("client2"))
      .mockResolvedValueOnce(token("app2"));
    const res = await getAvatarToken("app1", config);
    expect(res.accessToken).toBe("app2");
    expect(post).toHaveBeenCalledTimes(4);
  });

  it("shares one request between concurrent calls", async () => {
    post.mockImplementation(async (url) =>
      String(url).includes("/realms/") ? token("client") : token("app"),
    );
    await Promise.all([
      getAvatarToken("app1", config),
      getAvatarToken("app1", config),
    ]);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("does not call the API when the client login fails", async () => {
    post.mockRejectedValueOnce(new Error("401"));
    expect(await getAvatarToken("app1", config)).toEqual({ appId: "app1" });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failure", async () => {
    post
      .mockResolvedValueOnce(token("client"))
      .mockRejectedValueOnce(new Error("503"));
    expect(await getAvatarToken("app1", config)).toEqual({ appId: "app1" });
    post.mockResolvedValueOnce(token("app"));
    expect((await getAvatarToken("app1", config)).accessToken).toBe("app");
  });

  it("returns only the appId without one", async () => {
    expect(await getAvatarToken(null, config)).toEqual({ appId: null });
    expect(post).not.toHaveBeenCalled();
  });
});

describe("getAvatarTokenWithClientSecret", () => {
  beforeEach(() => {
    clearTokenCache();
    post.mockReset();
  });

  it("authenticates the app client with its own secret", async () => {
    post.mockResolvedValueOnce(token("robot"));
    const res = await getAvatarTokenWithClientSecret(
      "app1",
      { PRIVATE_AUTH_CLIENT_ID: "robot", PRIVATE_API_BASE_URL: "http://api" },
      "robot-secret",
    );
    expect(res.accessToken).toBe("robot");
    expect(post.mock.calls[0][0]).toBe(
      "http://api/platform/token/access_token",
    );
    expect(post.mock.calls[0][1]).toEqual({
      appId: "app1",
      clientId: "robot",
      clientSecret: "robot-secret",
    });
  });
});
