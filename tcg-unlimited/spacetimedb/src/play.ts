import { t } from "spacetimedb/server";
import db from "./schema";
import { performDesignerAction, progressFor } from "./designer-rules";
import * as wire from "./contracts";
import { requireRule, text, validateDeck } from "./validation";
import {
  initializeMatch,
  performAction,
  advancePhase,
  concede,
} from "./engine";
import {
  run,
  version,
  getRoom,
  membership,
  ownedDeck,
  clearReady,
  type Ctx,
} from "./helpers";

export const saveDeck = db.reducer(
  {
    deckId: t.u64().optional(),
    expectedRevision: t.u32().optional(),
    requestId: t.string(),
    versionId: t.u64(),
    name: t.string(),
    entries: t.array(wire.deckEntry),
  },
  (ctx, a) =>
    run(() => {
      text(a.requestId, "Request ID", 64);
      text(a.name, "Deck name");
      const g = version(ctx, a.versionId).definition;
      const count = validateDeck(g, a.entries, false);
      const complete = count >= g.deckRules.minSize;
      if (a.deckId === undefined) {
        const decks = [...ctx.db.savedDeck.owner.filter(ctx.sender)];
        if (decks.some((d) => d.requestId === a.requestId)) return;
        requireRule(decks.length < 100, "At most 100 decks per player");
        ctx.db.savedDeck.insert({
          id: 0n,
          owner: ctx.sender,
          versionId: a.versionId,
          requestId: a.requestId,
          name: a.name,
          entries: a.entries,
          revision: 1,
          complete,
          updatedAt: ctx.timestamp,
        });
      } else {
        const deck = ownedDeck(ctx, a.deckId);
        requireRule(
          deck.revision === a.expectedRevision,
          "Deck changed; refresh before retrying",
        );
        requireRule(
          deck.versionId === a.versionId,
          "Save a new deck for a different game version",
        );
        ctx.db.savedDeck.id.update({
          ...deck,
          name: a.name,
          entries: a.entries,
          complete,
          revision: deck.revision + 1,
          updatedAt: ctx.timestamp,
        });
        clearReady(ctx, deck.id);
      }
    }),
);
export const deleteDeck = db.reducer(
  { deckId: t.u64(), expectedRevision: t.u32() },
  (ctx, a) =>
    run(() => {
      const deck = ownedDeck(ctx, a.deckId);
      requireRule(
        deck.revision === a.expectedRevision,
        "Deck changed; refresh before retrying",
      );
      for (const m of ctx.db.roomMember.owner.filter(ctx.sender)) {
        if (m.deckId === deck.id && getRoom(ctx, m.roomId).status === "lobby")
          ctx.db.roomMember.id.update({
            ...m,
            deckId: undefined,
            deckRevision: undefined,
            ready: false,
          });
      }
      ctx.db.savedDeck.id.delete(deck.id);
    }),
);
export const createRoom = db.reducer(
  { requestId: t.string(), versionId: t.u64(), name: t.string() },
  (ctx, a) =>
    run(() => {
      text(a.requestId, "Request ID", 64);
      text(a.name, "Room name");
      version(ctx, a.versionId);
      const rooms = [...ctx.db.room.host.filter(ctx.sender)];
      if (rooms.some((r) => r.requestId === a.requestId)) return;
      requireRule(
        rooms.filter((r) => r.status === "lobby" || r.status === "active")
          .length < 10,
        "At most 10 open hosted rooms",
      );
      const r = ctx.db.room.insert({
        id: 0n,
        host: ctx.sender,
        requestId: a.requestId,
        versionId: a.versionId,
        name: a.name,
        status: "lobby",
        playerCount: 1,
        matchId: undefined,
        createdAt: ctx.timestamp,
      });
      ctx.db.roomMember.insert({
        id: 0n,
        roomId: r.id,
        owner: ctx.sender,
        seat: 0,
        deckId: undefined,
        deckRevision: undefined,
        ready: false,
      });
    }),
);
export const joinRoom = db.reducer({ roomId: t.u64() }, (ctx, a) =>
  run(() => {
    const r = getRoom(ctx, a.roomId);
    requireRule(r.status === "lobby", "Room is not accepting players");
    const members = [...ctx.db.roomMember.roomId.filter(r.id)];
    if (members.some((m) => m.owner.equals(ctx.sender))) return;
    const max = version(ctx, r.versionId).definition.participants.maximum;
    requireRule(members.length < max, "Room is full");
    let seat = 0;
    while (members.some((m) => m.seat === seat)) seat++;
    ctx.db.roomMember.insert({
      id: 0n,
      roomId: r.id,
      owner: ctx.sender,
      seat,
      deckId: undefined,
      deckRevision: undefined,
      ready: false,
    });
    ctx.db.room.id.update({ ...r, playerCount: members.length + 1 });
  }),
);
export const leaveRoom = db.reducer({ roomId: t.u64() }, (ctx, a) =>
  run(() => {
    const r = getRoom(ctx, a.roomId);
    const m = membership(ctx, r.id);
    if (r.status === "active") {
      const match = ctx.db.match.roomId.find(r.id)!;
      requireRule(
        match.state.players.find((p) => p.seat === m.seat)?.eliminated,
        "Concede the active match before leaving",
      );
    }
    ctx.db.roomMember.id.delete(m.id);
    const remaining = [...ctx.db.roomMember.roomId.filter(r.id)].sort(
      (a, b) => a.seat - b.seat,
    );
    ctx.db.room.id.update({
      ...r,
      playerCount: remaining.length,
      status: remaining.length ? r.status : "closed",
      host:
        r.host.equals(ctx.sender) && remaining.length
          ? remaining[0].owner
          : r.host,
    });
  }),
);
export const selectDeck = db.reducer(
  { roomId: t.u64(), deckId: t.u64() },
  (ctx, a) =>
    run(() => {
      const r = getRoom(ctx, a.roomId);
      requireRule(r.status === "lobby", "Match has already started");
      const m = membership(ctx, r.id);
      const deck = ownedDeck(ctx, a.deckId);
      requireRule(
        deck.versionId === r.versionId,
        "Deck must use the room game version",
      );
      ctx.db.roomMember.id.update({
        ...m,
        deckId: deck.id,
        deckRevision: deck.revision,
        ready: false,
      });
    }),
);
export const setReady = db.reducer(
  { roomId: t.u64(), ready: t.bool() },
  (ctx, a) =>
    run(() => {
      const r = getRoom(ctx, a.roomId);
      requireRule(r.status === "lobby", "Match has already started");
      const m = membership(ctx, r.id);
      if (!a.ready) {
        ctx.db.roomMember.id.update({ ...m, ready: false });
        return;
      }
      requireRule(m.deckId !== undefined, "Select a deck first");
      const deck = ownedDeck(ctx, m.deckId);
      requireRule(
        deck.versionId === r.versionId && deck.complete,
        "Select a complete compatible deck",
      );
      validateDeck(version(ctx, r.versionId).definition, deck.entries, true);
      ctx.db.roomMember.id.update({
        ...m,
        deckRevision: deck.revision,
        ready: true,
      });
    }),
);
export const startMatch = db.reducer({ roomId: t.u64() }, (ctx, a) =>
  run(() => {
    const r = getRoom(ctx, a.roomId);
    requireRule(r.host.equals(ctx.sender), "Only the host can start the match");
    requireRule(r.status === "lobby", "Room is not in its lobby");
    const game = version(ctx, r.versionId).definition;
    const selections = [...ctx.db.roomMember.roomId.filter(r.id)].map((m) => {
      requireRule(
        m.ready && m.deckId !== undefined,
        "Every player must be ready",
      );
      const deck = ctx.db.savedDeck.id.find(m.deckId);
      requireRule(
        deck &&
          deck.owner.equals(m.owner) &&
          deck.versionId === r.versionId &&
          deck.revision === m.deckRevision,
        "A selected deck changed; ready up again",
      );
      return {
        seat: m.seat,
        deckId: deck.id,
        revision: deck.revision,
        entries: deck.entries,
      };
    });
    const state = initializeMatch(game, selections, (min, max) =>
      ctx.random.integerInRange(min, max),
    );
    const match = ctx.db.match.insert({
      id: 0n,
      roomId: r.id,
      versionId: r.versionId,
      state,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
    ctx.db.room.id.update({ ...r, status: "active", matchId: match.id });
    if (ctx.db.versionRules.versionId.find(r.versionId))
      ctx.db.matchRuleProgress.insert({
        matchId: match.id,
        progress: progressFor(state),
      });
  }),
);
function gameForMatch(ctx: Ctx, id: bigint) {
  const match = ctx.db.match.id.find(id);
  requireRule(match, "Unknown match");
  const member = membership(ctx, match.roomId);
  return { match, member, game: version(ctx, match.versionId).definition };
}
function record(
  ctx: Ctx,
  match: NonNullable<ReturnType<Ctx["db"]["match"]["id"]["find"]>>,
  state: wire.MatchState,
  seat: number,
  kind: string,
  actionId: string,
  outcomes: wire.RandomOutcome[],
) {
  ctx.db.match.id.update({ ...match, state, updatedAt: ctx.timestamp });
  const progress = ctx.db.matchRuleProgress.matchId.find(match.id);
  if (progress)
    ctx.db.matchRuleProgress.matchId.update({
      ...progress,
      progress: progressFor(state, progress.progress),
    });
  if (state.status === "finished") {
    const r = getRoom(ctx, match.roomId);
    ctx.db.room.id.update({ ...r, status: "finished" });
  }
  ctx.db.matchEvent.insert({
    id: 0n,
    matchId: match.id,
    revision: state.revision,
    seat,
    kind,
    actionId,
    outcomes,
    at: ctx.timestamp,
  });
}
const matchArgs = { matchId: t.u64(), expectedRevision: t.u32() };
export const takeAction = db.reducer(
  { ...matchArgs, input: wire.actionInput },
  (ctx, a) =>
    run(() => {
      const { match, member, game } = gameForMatch(ctx, a.matchId);
      const rules = ctx.db.versionRules.versionId.find(match.versionId)?.rules;
      const random = (min: number, max: number) =>
        ctx.random.integerInRange(min, max);
      const configured = rules
        ? performDesignerAction(
            game,
            match.state,
            member.seat,
            a.expectedRevision,
            a.input,
            random,
            rules,
            ctx.db.matchRuleProgress.matchId.find(match.id)?.progress,
          )
        : undefined;
      const result =
        configured ??
        performAction(
          game,
          match.state,
          member.seat,
          a.expectedRevision,
          a.input,
          (min, max) => ctx.random.integerInRange(min, max),
        );
      if (configured)
        ctx.db.matchRuleProgress.matchId.update({
          matchId: match.id,
          progress: configured.progress,
        });
      record(
        ctx,
        match,
        result.state,
        member.seat,
        "action",
        a.input.actionId,
        result.outcomes,
      );
    }),
);
export const advanceTurnPhase = db.reducer(matchArgs, (ctx, a) =>
  run(() => {
    const { match, member, game } = gameForMatch(ctx, a.matchId);
    const result = advancePhase(
      game,
      match.state,
      member.seat,
      a.expectedRevision,
      (min, max) => ctx.random.integerInRange(min, max),
    );
    record(
      ctx,
      match,
      result.state,
      member.seat,
      "advance",
      "",
      result.outcomes,
    );
  }),
);
export const concedeMatch = db.reducer(matchArgs, (ctx, a) =>
  run(() => {
    const { match, member, game } = gameForMatch(ctx, a.matchId);
    requireRule(
      match.state.revision === a.expectedRevision,
      "Match changed; refresh before retrying",
    );
    const result = concede(game, match.state, member.seat, (min, max) =>
      ctx.random.integerInRange(min, max),
    );
    record(
      ctx,
      match,
      result.state,
      member.seat,
      "concede",
      "",
      result.outcomes,
    );
  }),
);
