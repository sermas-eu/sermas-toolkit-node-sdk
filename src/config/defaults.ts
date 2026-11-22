export const defaults = {
  auth: {
    // the API's own token endpoint (AUTH_PROVIDER=local, the default); a Keycloak
    // base URL (…/keycloak) with AUTH_PROVIDER=keycloak
    PUBLIC_AUTH_URL: "http://172.17.0.1:8080/api/auth/oidc",
    PUBLIC_AUTH_REALM: "sermas-local",
    PRIVATE_AUTH_CLIENT_ID: "platform",
    PRIVATE_AUTH_CLIENT_SECRET: "platform",
    PRIVATE_API_BASE_URL: "http://api:3000/api",
  },
  sermas: {
    SERMAS_BASE_URL: "http://localhost:8080",
    SERMAS_CLIENT_ID: "sermas-client",
    SERMAS_CLIENT_SECRET: "s3cr3t",
    SERMAS_APPID: "sermas",
  },
} as const;
