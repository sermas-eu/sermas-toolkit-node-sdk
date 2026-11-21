# SERMAS toolkit node SDK

Server-side helpers for SERMAS apps: tokens for kiosk-like frontends, and a small
framework to build an app backend that reacts to sessions, tools and UI events.

## Tokens for a frontend

A frontend's server side (the kiosk's SvelteKit loaders, for one) mints the app
token its browser code uses:

```ts
import { getAvatarToken } from "@sermas/sermas-toolkit-node-sdk";

const token = await getAvatarToken("my-app", {
  PUBLIC_AUTH_URL: "http://localhost:8080/keycloak",
  PUBLIC_AUTH_REALM: "sermas-local",
  PRIVATE_AUTH_CLIENT_ID: "kiosk",
  PRIVATE_AUTH_CLIENT_SECRET: "<kiosk client secret>",
  PRIVATE_API_BASE_URL: "http://localhost:8080/api",
});
// { appId, accessToken, refreshToken, expiresIn }, or { appId } on failure
```

It logs in as the configured client (the API's `kiosk` client may mint only
`avatar` and `robot` app tokens) and asks the API for the app's `avatar` token.
Tokens are cached in the process until 30 s before they expire.
`getAvatarTokenWithClientSecret` gets the token of an app client that has its own
secret instead.

## An app backend

```ts
import { EventEmitter2 } from "eventemitter2";
import { SermasApp, Store, UI, Tools } from "@sermas/sermas-toolkit-node-sdk";

const sermas = new SermasApp(
  {
    SERMAS_BASE_URL: "http://localhost:8080",
    SERMAS_APPID: "my-app",
    SERMAS_CLIENT_ID: "application",
    SERMAS_CLIENT_SECRET: "<client secret>",
  },
  new EventEmitter2(),
);
const store = new Store(sermas); // per-session state in the session storage
const ui = new UI(sermas, store); // agent messages, buttons, images
const tools = new Tools(sermas); // dialogue tools per session

sermas.emitter.on("session.started", (session) =>
  ui.sendAgentMessage(session, "Hello!"),
);
sermas.emitter.on("tool", (ev) => console.log("tool", ev.name));
```

Events on `sermas.emitter`: `sermas.ready`, `session`, `session.started`, `tool`,
`ui.interaction`, `agent.changed`. `OpenAIClient` wraps the OpenAI chat API (`model`
defaults to `gpt-4o-mini`).

## Development

Node 24 (`nvm use`). `@sermas/api-client` is compiled from its sources: a
`sermas-api-client` checkout beside this one, or `API_CLIENT_DIR` for the tests.

```sh
npm ci
npm run typecheck && npm run lint && npm test
npm run build
```

## License
```
   Copyright 2024 Spindox Labs srl

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```
