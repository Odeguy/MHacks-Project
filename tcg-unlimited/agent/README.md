# Grok game creation agent

The React editor sends a game idea to a local Node service. Grok requests creation
tools; the service executes them on an isolated draft and returns tool results.
The draft must pass the existing publication validators before it is returned.
Choosing **Use generated draft** loads it into an unsaved editor workspace.
**Save draft** and **Publish game** use the existing authenticated SpacetimeDB flow.
The agent never receives the player's SpacetimeDB token and never publishes directly.

Deck generation is available in **Decks → Generate deck** and **Lobby → Generate a deck**.
Leave the deck idea blank for a surprise deck. The generator chooses existing cards,
checks deck size/formats/copy limits, and saves through the player's authenticated
SpacetimeDB connection. In a lobby it uses the room's exact game version and selects
the saved deck without navigating. Deck generation never modifies the game or its cards.

Requests naming familiar games produce compact adaptations using supported mechanics,
with simplified/omitted rules described in the draft. Generation uses low reasoning
effort and server-controlled setup, mechanics, cards, and finish stages. Each stage
exposes the relevant tools and requires a tool call; validation failures enable the full tool catalog for repairs.
Responses are limited to six tool calls (three in mechanics and repair rounds) and three card definitions total. The initial
generated pool is capped at eight distinct cards; expand it afterward in the editor.
The existing 60-second model request and six-minute total limits remain in place;
complex prompts can still time out.

If Grok reaches its output-token limit, game generation preserves completed calls and
reasoning and requests a smaller continuation. Truncated calls are not executed or
replayed, and interrupted responses cannot advance a stage or finish a game. Three
consecutive interrupted rounds without progress stop the attempt. Other upstream
failures remain errors. The 60-second per-request timeout is unchanged.

Server logs prefixed `[game-generation]` record a random generation ID, stage, round,
model duration, total elapsed duration, call/rejection counts, validation repair count,
and card count. They exclude prompts, card text, API keys, and raw upstream responses.
Use them to compare request latency and repair rates across identical prompts.

## Run locally

Use Node 22. The server needs an xAI API key and credits, independently of the Grok app.

1. Add your key to `agent/.env` as `XAI_API_KEY=...`. An empty file is supplied;
   `agent/.env.example` is the template for another checkout.
2. Set `XAI_MODEL` to a function-calling model available to your account. The default
   is `grok-4.7`, matching the current xAI quickstart.
3. Run `npm run agent:smoke` to verify the key/model with one small request.
4. Run `npm run agent:dev` in one terminal. It builds and starts the server at
   `http://127.0.0.1:8787`. Restart it after changing server code or `.env`.
5. Run `npm run dev -- --configLoader runner` in another terminal and open Create game.
   The existing Vite preview also proxies `/api/agent` when restarted with the updated config.
6. Enter a game idea, generate, then use the draft. Review/edit it, save, and publish.

`agent/.env` and `.build/` are ignored by Git. The key is read only by Node.
Never prefix it with `VITE_`; never add it to frontend code. No FetchAI is involved.
`AGENT_PORT` changes the service port; update both Vite proxy targets if you change it.
`AGENT_ALLOWED_ORIGINS` optionally overrides allowed browser origins (comma-separated).
The default service is for local development: it binds to loopback, validates Host/Origin,
allows two simultaneous generations, and bounds prompt, body, rounds and tool calls.
For public hosting, place it behind authenticated application access and account quotas;
route `/api/agent` to this service through the web server. Static hosting alone cannot run it.

## Render deployment

Use the same repository, branch `main`, and root directory `tcg-unlimited`.
For the agent Web Service, use build command `npm ci --include=dev && npm run agent:check`
and start command `npm run agent:dev`. Set `NODE_VERSION=22.16.0`, `XAI_API_KEY`,
`XAI_MODEL=grok-4.7`, and `AGENT_ALLOWED_ORIGINS=https://tcg-unlimited.onrender.com`.
Set the health check path to `/api/agent/health`.

Render supplies `PORT` and `RENDER_EXTERNAL_HOSTNAME`; the agent automatically binds
to `0.0.0.0` there and accepts that exact hostname. Cross-origin preflights and responses
permit only configured origins. Extra agent custom domains need `AGENT_ALLOWED_HOSTS`.
Allowed origins are browser access control, not per-user authentication or credit quotas.
The two-request concurrency cap remains; put public generation behind authenticated
access and usage limits for unrestricted public use.

On the Static Site, set `VITE_AGENT_URL` to the agent's actual public service URL
(for example `https://tcg-unlimited-agent.onrender.com`) and rebuild/redeploy it.
Keep `XAI_API_KEY` only on the Web Service. Empty `VITE_AGENT_URL` preserves local
Vite proxy routing. No change to either generation timeout is needed for deployment.

## Tools and supported behavior

Tools cover card formats (including custom numeric/text fields and buttons), player
limits, actions and triggered interactions, card batches/copy limits, an n×m field,
slot types/ownership, executable constraints, dice, coins, hand sizes, phases,
sub-phases, health/victory, deck rules, starter deck recipes, named optional resource
pools and costs, and special reaction/field rules. Read/validate/finish tools let Grok
repair errors before producing a result. Cards are not populated with placeholders.

Player-owned field slots are mirrored for each participant; shared slots are communal.
Hands remain private spaces. Draws and plays use phase budgets only, with no automatic
turn draw or global play cap. Sub-phases restrict action availability within the shared
phase budget. Starting hands are dealt by the match engine. Starter deck recipes are
part of the game definition; the existing deckbuilder saves player-owned decks.
Win conditions currently use health. Card images remain out of scope.

The model can only call the declared functions and supply bounded structured data.
It cannot execute generated code. Each successful creation call commits atomically;
failed calls return an error and leave the draft intact. Game, designer, special-card
and resource validators are shared with the backend. Generation is limited to 48
model rounds, 160 calls and 6 minutes; each upstream request has a 60-second timeout.
Cancellation closes the request and aborts the in-flight model call.

## Files and checks

- `schema.ts`: JSON Schema definitions and runtime input checking.
- `tools.ts`: draft creation tools and shared publication validation.
- `grok.ts`: server-only Responses API client.
- `designer.ts`: instructions and bounded tool loop.
- `generation-stages.ts`: stage tools, completion checks and generation budgets.
- `server.ts`: HTTP endpoint and request handling.
- `run.mjs`: build/launch; no agent framework or API SDK required.
- `src/components/AgentDesigner.tsx`: prompt, cancel, preview and apply UI.

Run `npm run agent:check` and `npm run test:agent` for typechecking and tests.
Agent tests mock only the remote Grok response, exercising real tools, validation,
repair feedback and HTTP handling without a key or paid API calls. UI tests:
`npx vitest run src/components/AgentDesigner.test.tsx --configLoader runner`.
The live Grok integration requires your key and is not verified by the mock tests.
To check persistence against an isolated local database, set `TCG_BACKEND_INTEGRATION=1`,
`TCG_TEST_HOST=ws://127.0.0.1:3000`, and `TCG_TEST_DATABASE=tcg-backend-test-special`,
then run `npm run test:agent`. The database must already contain the published module.
The integration test refuses non-local hosts or database names outside `tcg-backend-test*`.

API reference: https://docs.x.ai/developers/tools/function-calling
