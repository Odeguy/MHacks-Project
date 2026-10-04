import {
  SenderError,
  type ReducerCtx,
  type InferSchema,
} from "spacetimedb/server";
import db from "./schema";
import { requireRule, text } from "./validation";
import type { GameDefinition } from "./contracts";
export type Ctx = ReducerCtx<InferSchema<typeof db>>;
export function run(work: () => void) {
  try {
    work();
  } catch (e) {
    throw new SenderError(e instanceof Error ? e.message : "Request failed");
  }
}
export function ownedDraft(ctx: Ctx, id: bigint, revision: number) {
  const draft = ctx.db.gameDraft.id.find(id);
  requireRule(
    draft && draft.owner.equals(ctx.sender),
    "Draft not found or not owned by you",
  );
  requireRule(
    draft.revision === revision,
    "Draft changed; refresh before retrying",
  );
  return draft;
}
export function version(ctx: Ctx, id: bigint) {
  const row = ctx.db.gameVersion.id.find(id);
  requireRule(row, "Unknown game version");
  return row;
}
export function getRoom(ctx: Ctx, id: bigint) {
  const row = ctx.db.room.id.find(id);
  requireRule(row, "Unknown room");
  return row;
}
export function membership(ctx: Ctx, roomId: bigint) {
  const row = [...ctx.db.roomMember.owner.filter(ctx.sender)].find(
    (m) => m.roomId === roomId,
  );
  requireRule(row, "Join the room first");
  return row;
}
export function ownedDeck(ctx: Ctx, id: bigint) {
  const deck = ctx.db.savedDeck.id.find(id);
  requireRule(
    deck && deck.owner.equals(ctx.sender),
    "Deck not found or not owned by you",
  );
  return deck;
}
export function clearReady(ctx: Ctx, deckId: bigint) {
  for (const m of ctx.db.roomMember.owner.filter(ctx.sender)) {
    if (m.deckId === deckId && getRoom(ctx, m.roomId).status === "lobby")
      ctx.db.roomMember.id.update({
        ...m,
        ready: false,
        deckRevision: undefined,
      });
  }
}
export function insertDraft(
  ctx: Ctx,
  requestId: string,
  title: string,
  description: string,
  definition: GameDefinition,
) {
  text(requestId, "Request ID", 64);
  text(title, "Title");
  requireRule(description.length <= 2000, "Description is too long");
  const drafts = [...ctx.db.gameDraft.owner.filter(ctx.sender)];
  if (drafts.some((d) => d.requestId === requestId)) return;
  requireRule(drafts.length < 50, "At most 50 drafts per player");
  ctx.db.gameDraft.insert({
    id: 0n,
    owner: ctx.sender,
    requestId,
    title,
    description,
    definition,
    revision: 1,
    validatedRevision: undefined,
    validationError: "",
    createdAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });
}
