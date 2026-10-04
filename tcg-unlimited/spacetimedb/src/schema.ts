import { schema, table, t } from "spacetimedb/server";
import {
  deckEntry,
  gameDefinition,
  matchState,
  randomOutcome,
  designerRules,
  ruleProgress,
  specialRules,
  resourceRules,
  resourceBalance,
} from "./contracts";

export const user = table(
  { name: "user", public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string().optional(),
  },
);
export const connection = table(
  { name: "connection" },
  {
    id: t.connectionId().primaryKey(),
    owner: t.identity().index("btree"),
  },
);
export const lobbyCleanup = table(
  { name: "lobby_cleanup" },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    owner: t.identity().index("btree"),
  },
);
export const gameDraft = table(
  { name: "game_draft" },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index("btree"),
    requestId: t.string(),
    title: t.string(),
    description: t.string(),
    definition: gameDefinition,
    revision: t.u32(),
    validatedRevision: t.u32().optional(),
    validationError: t.string(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  },
);
export const publishedGame = table(
  { name: "published_game", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    title: t.string(),
    description: t.string(),
    latestVersionId: t.u64(),
    createdAt: t.timestamp(),
  },
);
export const gameVersion = table(
  { name: "game_version", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    gameId: t.u64().index("btree"),
    version: t.u32(),
    draftId: t.u64(),
    draftRevision: t.u32(),
    definition: gameDefinition,
    publishedAt: t.timestamp(),
  },
);
export const savedDeck = table(
  { name: "saved_deck" },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index("btree"),
    versionId: t.u64(),
    requestId: t.string(),
    name: t.string(),
    entries: t.array(deckEntry),
    revision: t.u32(),
    complete: t.bool(),
    updatedAt: t.timestamp(),
  },
);
export const room = table(
  { name: "room", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    host: t.identity().index("btree"),
    requestId: t.string(),
    versionId: t.u64(),
    name: t.string(),
    status: t.string(),
    playerCount: t.u8(),
    matchId: t.u64().optional(),
    createdAt: t.timestamp(),
  },
);
export const roomMember = table(
  {
    name: "room_member",
    indexes: [
      {
        accessor: "byRoomOwner",
        algorithm: "btree",
        columns: ["roomId", "owner"],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index("btree"),
    owner: t.identity().index("btree"),
    seat: t.u8(),
    deckId: t.u64().optional(),
    deckRevision: t.u32().optional(),
    ready: t.bool(),
  },
);
export const match = table(
  { name: "match" },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().unique(),
    versionId: t.u64(),
    state: matchState,
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  },
);
export const matchEvent = table(
  { name: "match_event" },
  {
    id: t.u64().primaryKey().autoInc(),
    matchId: t.u64().index("btree"),
    revision: t.u32(),
    seat: t.u8(),
    kind: t.string(),
    actionId: t.string(),
    outcomes: t.array(randomOutcome),
    at: t.timestamp(),
  },
);
export const draftRules = table(
  { name: "draft_rules" },
  {
    draftId: t.u64().primaryKey(),
    owner: t.identity().index("btree"),
    rules: designerRules,
  },
);
export const versionRules = table(
  { name: "version_rules", public: true },
  {
    versionId: t.u64().primaryKey(),
    rules: designerRules,
  },
);
export const matchRuleProgress = table(
  { name: "match_rule_progress" },
  {
    matchId: t.u64().primaryKey(),
    progress: ruleProgress,
  },
);
export const draftSpecialRules = table(
  { name: "draft_special_rules" },
  {
    draftId: t.u64().primaryKey(),
    owner: t.identity().index("btree"),
    rules: specialRules,
  },
);
export const versionSpecialRules = table(
  { name: "version_special_rules", public: true },
  {
    versionId: t.u64().primaryKey(),
    rules: specialRules,
  },
);
export const reactionWindow = table(
  { name: "reaction_window" },
  {
    matchId: t.u64().primaryKey(),
    originSeat: t.u8(),
    actionId: t.string(),
    actionKind: t.string(),
    seats: t.array(t.u8()),
    responseSeat: t.u8(),
    expiresAt: t.timestamp(),
  },
);
export const draftResourceRules = table(
  { name: "draft_resource_rules" },
  { draftId: t.u64().primaryKey(), owner: t.identity().index("btree"), rules: resourceRules },
);
export const versionResourceRules = table(
  { name: "version_resource_rules", public: true },
  { versionId: t.u64().primaryKey(), rules: resourceRules },
);
export const matchResourceBalances = table(
  { name: "match_resource_balances" },
  { matchId: t.u64().primaryKey(), balances: t.array(resourceBalance) },
);
const spacetimedb = schema({
  draftResourceRules,
  versionResourceRules,
  matchResourceBalances,
  lobbyCleanup,
  draftSpecialRules,
  versionSpecialRules,
  reactionWindow,
  draftRules,
  versionRules,
  matchRuleProgress,
  user,
  connection,
  gameDraft,
  publishedGame,
  gameVersion,
  savedDeck,
  room,
  roomMember,
  match,
  matchEvent,
});
export default spacetimedb;
