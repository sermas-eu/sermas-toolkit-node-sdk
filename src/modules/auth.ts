import axios, { isAxiosError } from "axios";
import * as https from "node:https";
import { Logger } from "@sermas/api-client";
import { defaults } from "../config/defaults.js";

export type AuthConfig = {
  PUBLIC_AUTH_URL?: string;
  PUBLIC_AUTH_REALM?: string;
  PRIVATE_AUTH_CLIENT_ID?: string;
  PRIVATE_AUTH_CLIENT_SECRET?: string;
  PRIVATE_API_BASE_URL?: string;
};

/** What getAvatarToken returns: the tokens, absent when they could not be had. */
export type AvatarToken = {
  appId: string | null;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: Date;
};

type TokenResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: Date;
};

const logger = new Logger("auth");

const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV !== "development",
});

// a token is reused until this long before it expires
const EXPIRY_MARGIN_MS = 30 * 1000;

// Tokens shared by every call in this process: a kiosk calls getAvatarToken on
// each page load, and each fetch is a round trip to Keycloak or the API.
const tokens = new Map<string, TokenResponse>();
// concurrent calls for the same token share one request
const pending = new Map<string, Promise<TokenResponse | null>>();

/** Drops every cached token (tests, or after a secret change). */
export const clearTokenCache = () => {
  tokens.clear();
  pending.clear();
};

const toToken = (data: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}): TokenResponse => ({
  accessToken: data.access_token,
  refreshToken: data.refresh_token,
  expiresIn: new Date(Date.now() + data.expires_in * 1000),
});

const cached = async (
  key: string,
  fetch: () => Promise<TokenResponse | null>,
): Promise<TokenResponse | null> => {
  const token = tokens.get(key);
  if (token && token.expiresIn.getTime() - EXPIRY_MARGIN_MS > Date.now())
    return token;
  tokens.delete(key);

  let request = pending.get(key);
  if (!request) {
    request = fetch().finally(() => pending.delete(key));
    pending.set(key, request);
  }
  const fresh = await request;
  if (fresh) tokens.set(key, fresh);
  return fresh;
};

const logFailure = (what: string, e: unknown) => {
  if (isAxiosError(e)) {
    logger.error(
      `${what} failed: ${e.response?.status ?? e.code} ${JSON.stringify(e.response?.data ?? "")}`,
    );
  } else if (e instanceof Error) {
    logger.error(`${what} failed: ${e.message}`);
  }
};

const resolveConfig = (authConfig: AuthConfig) => ({
  authUrl: authConfig.PUBLIC_AUTH_URL || defaults.auth.PUBLIC_AUTH_URL,
  realm: authConfig.PUBLIC_AUTH_REALM || defaults.auth.PUBLIC_AUTH_REALM,
  clientId:
    authConfig.PRIVATE_AUTH_CLIENT_ID || defaults.auth.PRIVATE_AUTH_CLIENT_ID,
  clientSecret:
    authConfig.PRIVATE_AUTH_CLIENT_SECRET ||
    defaults.auth.PRIVATE_AUTH_CLIENT_SECRET,
  apiBaseUrl:
    authConfig.PRIVATE_API_BASE_URL || defaults.auth.PRIVATE_API_BASE_URL,
});

/** The service account token of the configured client (client credentials). */
const getClientToken = (config: ReturnType<typeof resolveConfig>) =>
  cached(
    `client:${config.authUrl}:${config.realm}:${config.clientId}`,
    async () => {
      const url = `${config.authUrl}/realms/${config.realm}/protocol/openid-connect/token`;
      try {
        logger.debug(`Requesting client token from ${url}`);
        const res = await axios.post(
          url,
          new URLSearchParams({
            grant_type: "client_credentials",
            client_id: config.clientId,
            client_secret: config.clientSecret,
          }),
          { httpsAgent },
        );
        return toToken(res.data);
      } catch (e) {
        logFailure(`Client token for ${config.clientId}`, e);
        return null;
      }
    },
  );

/**
 * Returns access and refresh tokens of the app's `avatar` client, minted by the
 * API (POST /platform/token) for the configured client, e.g. the kiosk client.
 * Without an appId, or when a step fails, only `{ appId }` is returned.
 */
export const getAvatarToken = async (
  appId: string | null = null,
  authConfig: AuthConfig = defaults.auth,
): Promise<AvatarToken> => {
  const config = resolveConfig(authConfig);
  if (!appId) return { appId };

  const clientToken = await getClientToken(config);
  if (!clientToken) return { appId };

  const appClientId = "avatar";
  const appToken = await cached(
    `app:${config.apiBaseUrl}:${config.clientId}:${appId}:${appClientId}`,
    async () => {
      try {
        const res = await axios.post(
          `${config.apiBaseUrl}/platform/token`,
          { appId, clientId: appClientId },
          {
            httpsAgent,
            headers: { Authorization: `Bearer ${clientToken.accessToken}` },
          },
        );
        return toToken(res.data);
      } catch (e) {
        logFailure(`App token for appId=${appId}`, e);
        return null;
      }
    },
  );

  return { ...(appToken || {}), appId };
};

/**
 * Returns access and refresh tokens for an app client that authenticates with
 * its own secret (server to server).
 * @param {AuthConfig} authConfig only PRIVATE_API_BASE_URL and PRIVATE_AUTH_CLIENT_ID are used
 * @param {string} clientSecret the app client's secret
 */
export const getAvatarTokenWithClientSecret = async (
  appId: string | null = null,
  authConfig: AuthConfig = defaults.auth,
  clientSecret: string = "",
): Promise<AvatarToken> => {
  const config = resolveConfig(authConfig);
  if (!appId) return { appId };

  const appToken = await cached(
    `secret:${config.apiBaseUrl}:${appId}:${config.clientId}`,
    async () => {
      try {
        const res = await axios.post(
          `${config.apiBaseUrl}/platform/token/access_token`,
          { appId, clientId: config.clientId, clientSecret },
          { httpsAgent },
        );
        return toToken(res.data);
      } catch (e) {
        logFailure(
          `App token for appId=${appId} clientId=${config.clientId}`,
          e,
        );
        return null;
      }
    },
  );

  return { ...(appToken || {}), appId };
};
