# Backend

`src/index.ts` exports the SpacetimeDB module. `schema.ts` holds its tables, `design.ts` its creation reducers, `play.ts` its deck/lobby/match reducers, and `views.ts` its authenticated projections. `validation.ts` and `engine.ts` contain the deterministic rules. `contracts.ts` declares structured wire types shared by the stored definitions and reducer arguments.

## Data and access

| Data                             | Access                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `published_game`, `game_version` | Public gallery and immutable definitions                                                                                            |
| `room`                           | Public lobby discovery, status, and participant count                                                                               |
| `user`                           | Public identity and optional display name                                                                                           |
| Drafts and saved decks           | Private tables, exposed only through `my_drafts` and `my_decks`                                                                     |
| Membership selections            | Private table; `my_memberships` exposes your selection, `room_participants` exposes seats/readiness without other players' deck IDs |
| Full match state and history     | Private tables; membership-filtered views expose permitted information                                                              |

Subscribe to `my_matches`, `match_players`, `visible_match_cards`, and `match_history` to play. Nonmembers receive no rows. A member sees their own hand, all living players' field cards, and spaces marked public. Deck contents and order are never exposed, even to their owner. Opponent hand counts and deck counts appear in `match_players`; opponent hand identities do not. Leaving a room removes access to its match views.

Identities always come from `ctx.sender`. Reducers use SpacetimeDB timestamps and RNG. Invalid requests throw `SenderError` and the entire transaction rolls back. Reducers do not return created IDs; observe subscribed rows. Use your own stable `requestId` to identify a newly created draft, deck, or room and to make creation retries idempotent.

## Creation agent tools

Every mutation of an existing draft takes `draftId` and `expectedRevision`. Read the new revision from `my_drafts` after each tool call. Incomplete drafts are allowed; edits invalidate earlier validation. Array items are upserted by their string `id`, so calling a tool with the same ID replaces that item.

| Planned tool             | Reducer                   | Definition value                                         |
| ------------------------ | ------------------------- | -------------------------------------------------------- |
| Create draft             | `createGameDraft`         | `requestId`, `title`, `description`                      |
| Create card format       | `createCardFormat`        | `format`: fields and action buttons                      |
| Participant limits       | `createParticipantLimits` | `limits`: minimum/maximum                                |
| Card interaction         | `createCardInteraction`   | `interaction`: source, target, cost, conditions, effects |
| Card triggers            | `createCardTrigger`       | `trigger`: event, conditions, effects                    |
| Create cards             | `createCard`              | `card`: format, field values, actions, triggers          |
| Field matrix and slots   | `createField`             | `field`: rows, columns, designated slots                 |
| Separate spaces          | `createSpace`             | `space`: kind, visibility, capacity                      |
| Constraints/rules        | `createConstraint`        | `constraint`: actions, conditions, rejection message     |
| Add dice                 | `addDice`                 | `dice`: ID, count, sides                                 |
| Add coin                 | `addCoin`                 | `coin`: ID and two outcome labels                        |
| Hand size                | `createHandSize`          | `hand`: initial and maximum                              |
| Ordered turn phases      | `createTurnPhases`        | `phases` array                                           |
| Ordered sub-phases       | `createSubPhases`         | `phaseId`, `subPhases` array                             |
| Life                     | `createLife`              | `startingHealth`                                         |
| Win condition            | `createWinCondition`      | `victory`, currently `health`                            |
| Deck construction        | `createDeckRules`         | `rules`: sizes, copy limits, permitted formats           |
| Starter deck recipe      | `createStarterDeck`       | `deck`: ID, name, entries                                |
| Initialization settings  | `createSetup`             | `setup`: starting resource, turn resource, turn draw     |
| Replace a complete draft | `updateGameDraft`         | `title`, `description`, structured `definition`          |
| Validate                 | `validateGameDraft`       | Saves `validationError` or stamps the current revision   |
| Publish                  | `publishGame`             | Optional `gameId` to append a version to an owned game   |

`updateGameDraft` also lets an agent remove items by supplying the revised definition. Publication checks vocabulary, references, field values, capacities, timing, targets, and deck recipes. Each published version is immutable. Decks, rooms, and matches use a particular `versionId`; publishing a new version does not change existing games in progress.

The manual editor calls `updateDesignerDraft` with the same draft/revision/title/description/definition plus structured `rules`. These include the health label, total plays per turn, fighter/effect type roles, named slot types and per-card placement permissions, and per-phase action budgets. `my_draft_rules` exposes only the caller's private draft rules. Publishing snapshots them in public `version_rules`, keyed by immutable version ID. Older versions without these records continue using the original engine behavior. Adding these tables does not replace existing definition or match rows.

Each phase step specifies an action kind, optional card format, and maximum uses (zero forbids it). A format-specific step takes precedence over the all-types fallback. Attacks against players and cards share the same attack budget. Counts reset on phase changes; total plays reset only on the next turn. Ordered phases permit skipping forward but reject returning to an earlier step. Sub-phases share the enclosing phase's budgets and still restrict which actions are allowed. The server checks placement permissions after every effect and trigger, and rejected requests leave counts and state unchanged.

The card editor supports damage, healing, drawing, resource gains, stat changes, and discard effects. Effects execute from top to bottom when a placed card is activated; an optional once-per-card-per-turn restriction applies independently of the phase budget. Health labels are display metadata; victory remains based on health reaching zero.

A model runner can expose these generated reducer methods as its function tools. It should authenticate as the requesting player, serialize calls using current revisions, read validation feedback, and publish only when the user intends publication. The reducer API is provider-independent; no model credentials, LLM service, Fetch registration, or agent hosting are implemented here. Game rules are structured data, never generated JavaScript or free-text adjudication.

## Supported rule vocabulary

Formats contain `number` or `text` fields. Card values supply each field exactly once, using `numberValue` or `textValue` with the other value `undefined`. `buttons` are action IDs; cards can add their own `actionIds`. Effects can reference numeric attack/defense/points fields using keys chosen by the designer.

Actions have kinds `play`, `activate`, `attack`, `draw`, `roll`, or `flip`. Play uses a hand card and a field slot. Activate/attack use a controlled field card; draw/roll/flip are global actions with `sourceZone: 'none'`. The target kinds are `none`, `self`, `opponent`, `any_player`, `own_card`, `enemy_card`, or `any_card`. Card targets must be on the visible field. The target player for a card target is derived from its owner. Costs and constraints are checked before effects. `oncePerTurn` applies to the action ID and card instance, or once globally for a source-free action.

Effects resolve in array order:

| Kind                              | Behavior                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `draw`                            | Draw from the owner's shuffled deck into their separate hand                   |
| `move`                            | Move a source/target card to a defined space or requested field slot           |
| `discard`                         | Move a card to its owner's discard space                                       |
| `damage`                          | Reduce player health, or destroy a card if resolved damage exceeds its defense |
| `heal`                            | Restore health up to starting health                                           |
| `gain_resource`, `spend_resource` | Modify player resources; spending requires sufficient resources                |
| `change_stat`                     | Change a numeric card field, bounded to 0–1,000,000                            |
| `roll_dice`, `flip_coin`          | Generate server-side random outcomes, recorded in match history                |

Effect targets are `actor`, `target_player`, `source_card`, and `target_card`. An effect's resolved amount is its `amount` plus the source card's `statKey` value, if given, plus the sum of a previously rolled `randomId`, if given. `change_stat` uses `statKey` as the field to modify. For card damage, `defenseKey` names the target's defense stat; without one, defense is zero. This MVP has destruction thresholds rather than persistent card health.

Conditions support `resource_at_least`, `health_at_least`, `hand_count_at_most`, `field_count_at_most`, and `card_stat_at_least`. Trigger conditions additionally support `roll_at_least` (dice ID in `key`) and `coin_is` (outcome label in `key`) against outcomes of the current action. Constraints apply to selected action IDs or all actions when that list is empty.

Triggers run on `played`, `activated`, `attacked`, `damaged`, `turn_started`, `phase_started`, and `sub_phase_started`. Card events run only that card's triggers; turn/phase events run the active player's field cards' triggers. For card events, `target_card` is the triggering card. Trigger player effects use `actor`, the triggering card's owner. Triggers cannot request a new field slot. Execution is limited to 16 nested trigger levels and 256 effects per request.

## Field, spaces, and turns

The matrix has 1–12 rows and columns. Only designated slots can hold cards. A slot with `owner: 'player'` is an independent slot in each player's area, identified by `(ownerSeat, slotId)`. A `shared` slot has one occupant across the table. `allowedFormatIds: []` accepts every format. Render player areas relative to the viewer's seat for the planned first-person table perspective.

Hand, deck, and discard are spaces outside the matrix. Exactly one of each is required; extra `reserve` spaces are supported. Hands are owner-visible, decks hidden, and discard visibility is configurable. The maximum hand limits drawing; a full hand leaves excess cards in the deck. An empty deck does not cause a loss in the health-only MVP. Moves to deck append at the bottom; only initialization shuffles.

Players advance through ordered sub-phases and phases. Legal actions must be allowed by both the phase and current sub-phase. Advancing beyond the final phase starts the next living player's turn, resets action usage, adds `turnResource`, and draws `turnDraw`. The first player starts with `startingResource` and the initial hand; automatic turn income/draw begins on subsequent turns. Health is checked after resolving the interaction. At zero health a player is eliminated; the last surviving player wins. Simultaneous elimination of everyone is a draw. Concession uses the same elimination logic. Participant limits support 2–8; the example uses two.

## Saved decks and rooms

`saveDeck` takes `requestId`, `versionId`, `name`, and `entries: [{ cardId, quantity }]`. For a new deck, pass `deckId` and `expectedRevision` as `undefined`. To edit, pass the saved ID and current revision. Incomplete decks can be saved, but copy/format/maximum-size rules still apply. A deck's version cannot be changed in place. `deleteDeck` checks ownership and revision.

The room flow is:

1. Host calls `createRoom({ requestId, versionId, name })` and receives seat zero.
2. Others call `joinRoom({ roomId })`; capacity is enforced.
3. Each calls `selectDeck({ roomId, deckId })` using their own compatible deck.
4. Each calls `setReady({ roomId, ready: true })` with a complete deck. Editing a selected deck clears readiness in every affected lobby.
5. Host calls `startMatch({ roomId })`. The server rechecks readiness/revisions, snapshots each deck, creates unique card instances, shuffles with `ctx.random`, and deals initial hands atomically.
6. Call `takeAction({ matchId, expectedRevision, input })` or `advanceTurnPhase({ matchId, expectedRevision })`. The server determines the seat from membership, checks turn/phase/ownership/targets, and resolves rules. Stale revisions prevent duplicate effects. `concedeMatch` uses the same revision check.

Playing or later editing/deleting a saved deck never mutates the match's deck snapshot. Leaving a lobby transfers host ownership if needed. A living player must concede before leaving an active match. Finished rooms can be left; create a new room for a rematch. Persistence lasts for the database's lifetime; reusing the same stored authentication token restores ownership on reconnect.

## Try the example

After connecting and subscribing, use the generated SDK:

```typescript
await conn.reducers.createExampleDraft({ requestId: "my-first-game" });
// Read the row matching requestId from conn.db.myDrafts.
await conn.reducers.validateGameDraft({ draftId, expectedRevision: 1 });
// Inspect validationError / validatedRevision in the subscription.
await conn.reducers.publishGame({
  draftId,
  expectedRevision: 1,
  gameId: undefined,
});
// Read its game_version row; save the `balanced` starter recipe for each player.
```

The example has attack/defense/text fields, three unit slots per player, two card types, a resource cost, an on-play trigger, field-capacity constraints, a d6, a coin, ordered phases/sub-phases, health victory, and a six-card starter recipe. It is created only when requested; module startup does not insert sample data.

## Tests

`npm test` runs pure engine/validation tests without a server. The real SDK integration test is opt-in. It covers ownership, private views, immutable versions, saved-deck readiness, match snapshots, concurrent/stale actions, recorded RNG, concession, and revocation when leaving.

To run it from the project root against a fresh local test database:

```powershell
# Terminal 1: choose an unused port; this process discards data on exit.
spacetime start --listen-addr 127.0.0.1:3199 --in-memory

# Terminal 2: publish ONLY to this isolated server/database.
spacetime publish tcg-backend-test --module-path spacetimedb --server http://127.0.0.1:3199 --no-config --yes
$env:TCG_BACKEND_INTEGRATION = '1'
npm test
Remove-Item Env:TCG_BACKEND_INTEGRATION
```

Optional `TCG_TEST_HOST` and `TCG_TEST_DATABASE` override the test target. The suite refuses non-local hosts and database names outside the `tcg-backend-test` prefix. The old chat UI test belongs to the starter and is not run by the backend test script.

## MVP boundaries

The engine supports this closed vocabulary, health victory, and visible field cards. Arbitrary tabletop rules, reaction/priority stacks, face-down field cards, direct selection of hidden hand cards, matchmaking, spectators, generated artwork, text-to-move, and an LLM/Fetch service require further implementation. The first-person camera, hovering hands, deckbuilder controls, and gallery/room interfaces are frontend work.
