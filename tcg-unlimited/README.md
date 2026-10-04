# TCG Unlimited

Browser card games built from structured game definitions. React/Vite renders the client; a TypeScript SpacetimeDB module owns definitions, published versions, persistent decks, lobbies, and authoritative matches.

The backend implements the planning document's creation tools and a bounded rule engine. The frontend now includes the collection, game details, design studio, saved decks, deck workshop, and lobby/table layouts, with a grayscale WebGL background and Motion animations. The model/provider and Fetch integration are separate choices. There is no AI referee.

The interface subscribes to SpacetimeDB for published games, saved decks, drafts, rooms, and matches. Deck edits, duplication, draft saving and publishing, lobby readiness, and match actions call the backend reducers. The first-person table keeps hands separate from the field, receives only permitted card data, and follows the published version's rules. On an empty database, use **Add starter games** to create three playable examples and saved decks.

Cards use pastel fills, dark text, and white collection surfaces by default. A header toggle restores night mode. Continuous hue sliders change card colors; these appearance preferences and favorites stay in the browser. Unsaved design settings are locally autosaved; **Save draft** stores them in SpacetimeDB, and **Saved drafts** resumes them. The manual designer starts from a bounded card/rule template; prompt-based AI generation remains to be implemented.

**Create game** has General, Card types, Cards, Phases, and Field sections. Configure health and its name, hand/draw/play limits, fighter and effect types, card stats and copy limits, executable effects, ordered phase actions, and slot permissions. Paint slot types on the colored player areas; each player receives that layout, with hands kept separate. **Edit game rules** opens the owning draft from a game or deck. Publishing creates an immutable version: existing decks keep their original rules and new decks use the newly published version.

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
