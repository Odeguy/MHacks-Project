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
with simplified/omitted rules described in the draft. Related tool calls can be batched
to reduce round trips. The existing 60-second model request and six-minute total limits
remain in place; complex prompts can still time out.

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
