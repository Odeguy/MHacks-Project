# TCG Unlimited

Browser card games built from structured game definitions. React/Vite renders the client; a TypeScript SpacetimeDB module owns definitions, published versions, persistent decks, lobbies, and authoritative matches.

The backend implements the planning document's creation tools and a bounded rule engine. The frontend now includes the collection, game details, design studio, saved decks, deck workshop, and lobby/table layouts, with a grayscale WebGL background and Motion animations. A Node service uses Grok to design validated game drafts. There is no AI referee or FetchAI integration.

The interface subscribes to SpacetimeDB for published games, saved decks, drafts, rooms, and matches. Deck edits, duplication, draft saving and publishing, lobby readiness, and match actions call the backend reducers. The first-person table keeps hands separate from the field, receives only permitted card data, and follows the published version's rules. On an empty database, use **Add starter games** to create three playable examples and saved decks.

New manual game designs and saved decks start without cards. Numeric editor fields accept unfinished input while typing and apply their bounds on blur or Enter. Room discovery lists occupied lobbies and active matches. Leaving a lobby page removes your membership; joining or creating another lobby leaves the previous one. Disconnected lobby members get a 30-second reconnection grace period. Counts and host ownership update when members leave, and empty lobbies close. Active-match membership remains available for reconnection.

Cards use pastel fills, dark text, and white collection surfaces by default. The **Dark cards / Light cards** header toggle switches card appearance. Continuous hue sliders change card colors; these appearance preferences and favorites stay in the browser. Unsaved design settings are locally autosaved; **Save draft** stores them in SpacetimeDB, and **Saved drafts** resumes them. The manual designer starts from a bounded card/rule template; **Design with Grok** generates a separate draft for review and application to the editor.

**Create game** has General, Card types, Cards, Phases, and Field sections. Configure health and its name, hand limits, fighter and effect types, card stats and copy limits, executable effects, ordered phase actions, and slot permissions. Drawing and playing are controlled by phase action limits; turns do not automatically draw cards. Paint slot types on the colored player areas; each player receives that layout, with hands kept separate. **Edit game rules** opens the owning draft from a game or deck. Publishing creates an immutable version: existing decks keep their original rules and new decks use the newly published version.

Card types select a **Format**: Basic Atk/Def, Effect Atk/Def, Instant Effect, Persistent Effect, Equip Effect, Trap/Reaction, Field Effect, or Resource. The presets control combat fields and effect editing. Basic has no configured abilities; the other formats allow them. Traps respond after configured actions resolve, with one reaction or pass per eligible opponent and a 30-second response timeout. Field Effects apply configurable bonuses to stats, action budgets, draws, hand size, and costs while placed. Other abilities use placed-card activation; automatic instant resolution and equip attachment lifecycles remain to be implemented. Existing drafts using the former Fighter/Effect roles load into the new presets without discarding abilities.

**Resources** are optional under the game editor's General tab (off for new games). Configure up to eight independently named pools, with starting amounts and gains per turn for each player. In Cards, set each action's cost per pool and choose a pool for Gain resource or Spend resource effects. Named costs appear on cards and in deckbuilders; live balances appear for each player at the table. Disabling resources preserves the configuration but hides counters/costs and makes resource costs, effects, and conditions inactive. Existing published games retain their original resource behavior.

## Local development

Install Node.js and the SpacetimeDB CLI, then run these commands from this directory:

```powershell
npm install
npm --prefix spacetimedb install
npm run backend:check
npm test
```

Start the local database server in one terminal:

```powershell
spacetime start
```

In another terminal:

```powershell
npm run spacetime:publish:local
npm run spacetime:generate
Copy-Item .env.example .env.local
npm run dev
```

The local publish script explicitly targets a database named `tcg-unlimited` on `local`. `.env.local` points the frontend there. Existing project configuration still names the remote database `dsdfsdf`; the Maincloud publish script uses that configuration. Deploying this replacement for the starter chat module needs a schema migration review. No script automatically deletes database data.

## Backend guide

See [spacetimedb/README.md](spacetimedb/README.md) for reducers, view subscriptions, game format semantics, the example game, and integration testing. Generated client bindings are in `src/module_bindings`; regenerate after modifying the module schema or reducer arguments.

Useful commands:

| Command                      | Purpose                                                 |
| ---------------------------- | ------------------------------------------------------- |
| `npm run backend:check`      | Type-check the module and backend tests                 |
| `npm run backend:build`      | Compile the SpacetimeDB module                          |
| `npm test`                   | Run engine tests; the local integration suite is opt-in |
| `npm run spacetime:generate` | Regenerate the React/agent client SDK                   |
| `npm run build`              | Type-check and build the frontend                       |

If Vite cannot execute esbuild while loading its configuration in a restricted environment, use `npm run build -- --configLoader runner`.

## Grok game creation

The Create game editor can generate a validated draft using Grok's creation tools.
Add `XAI_API_KEY` to `agent/.env`, then run `npm run agent:dev` alongside Vite.
See [agent setup and tools](agent/README.md) for the full local workflow.
