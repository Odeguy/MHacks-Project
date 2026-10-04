import { t } from "spacetimedb/server";
import db, {
  gameDraft,
  savedDeck,
  roomMember,
  matchEvent,
  draftRules,
} from "./schema";
import { cardValue } from "./contracts";
import { visibleCards, playerSummaries } from "./engine";
export const myDrafts = db.view(
  { name: "my_drafts", public: true },
  t.array(gameDraft.rowType),
  (ctx) => [...ctx.db.gameDraft.owner.filter(ctx.sender)],
);
export const myDraftRules = db.view(
  { name: "my_draft_rules", public: true },
  t.array(draftRules.rowType),
  (ctx) => [...ctx.db.draftRules.owner.filter(ctx.sender)],
);
export const myDecks = db.view(
  { name: "my_decks", public: true },
  t.array(savedDeck.rowType),
  (ctx) => [...ctx.db.savedDeck.owner.filter(ctx.sender)],
);
export const myMemberships = db.view(
  { name: "my_memberships", public: true },
  t.array(roomMember.rowType),
  (ctx) => [...ctx.db.roomMember.owner.filter(ctx.sender)],
);
const participantRow = t.row("RoomParticipantProjection", {
  id: t.u64().primaryKey(),
  roomId: t.u64(),
  owner: t.identity(),
  seat: t.u8(),
  ready: t.bool(),
  hasDeck: t.bool(),
});
export const roomParticipants = db.view(
  { name: "room_participants", public: true },
  t.array(participantRow),
  (ctx) => {
    return [...ctx.db.roomMember.owner.filter(ctx.sender)].flatMap((m) =>
      [...ctx.db.roomMember.roomId.filter(m.roomId)].map((p) => ({
        id: p.id,
        roomId: p.roomId,
        owner: p.owner,
        seat: p.seat,
        ready: p.ready,
        hasDeck: p.deckId !== undefined,
      })),
    );
  },
);
const matchRow = t.row("MatchProjection", {
  id: t.u64().primaryKey(),
  roomId: t.u64(),
  versionId: t.u64(),
  status: t.string(),
  activeSeat: t.u8(),
  phaseIndex: t.u16(),
  subPhaseIndex: t.u16(),
  turn: t.u32(),
  revision: t.u32(),
  winnerSeat: t.u8().optional(),
});
export const myMatches = db.view(
  { name: "my_matches", public: true },
  t.array(matchRow),
  (ctx) => {
    return [...ctx.db.roomMember.owner.filter(ctx.sender)].flatMap((m) => {
      const match = ctx.db.match.roomId.find(m.roomId);
      if (!match) return [];
      const s = match.state;
      return [
        {
          id: match.id,
          roomId: match.roomId,
          versionId: match.versionId,
          status: s.status,
          activeSeat: s.activeSeat,
          phaseIndex: s.phaseIndex,
          subPhaseIndex: s.subPhaseIndex,
          turn: s.turn,
          revision: s.revision,
          winnerSeat: s.winnerSeat,
        },
      ];
    });
  },
);
const playerRow = t.row("PlayerProjection", {
  id: t.string().primaryKey(),
  matchId: t.u64(),
  seat: t.u8(),
  health: t.i32(),
  resource: t.i32(),
  eliminated: t.bool(),
  handCount: t.u16(),
  deckCount: t.u16(),
});
export const matchPlayers = db.view(
  { name: "match_players", public: true },
  t.array(playerRow),
  (ctx) => {
    return [...ctx.db.roomMember.owner.filter(ctx.sender)].flatMap((m) => {
      const match = ctx.db.match.roomId.find(m.roomId);
      if (!match) return [];
      const game = ctx.db.gameVersion.id.find(match.versionId)!;
      return playerSummaries(game.definition, match.state).map((p) => ({
        ...p,
        id: `${match.id}:${p.seat}`,
        matchId: match.id,
      }));
    });
  },
);
const visibleCardRow = t.row("VisibleCardProjection", {
  id: t.string().primaryKey(),
  matchId: t.u64(),
  instanceId: t.u32(),
  cardId: t.string(),
  ownerSeat: t.u8(),
  zone: t.string(),
  slotId: t.string(),
  position: t.u32(),
  values: t.array(cardValue),
});
export const visibleMatchCards = db.view(
  { name: "visible_match_cards", public: true },
  t.array(visibleCardRow),
  (ctx) => {
    return [...ctx.db.roomMember.owner.filter(ctx.sender)].flatMap((m) => {
      const match = ctx.db.match.roomId.find(m.roomId);
      if (!match) return [];
      const game = ctx.db.gameVersion.id.find(match.versionId)!;
      return visibleCards(game.definition, match.state, m.seat).map((c) => ({
        ...c,
        id: `${match.id}:${c.id}`,
        instanceId: c.id,
        matchId: match.id,
      }));
    });
  },
);
export const matchHistory = db.view(
  { name: "match_history", public: true },
  t.array(matchEvent.rowType),
  (ctx) => {
    return [...ctx.db.roomMember.owner.filter(ctx.sender)].flatMap((m) => {
      const match = ctx.db.match.roomId.find(m.roomId);
      return match ? [...ctx.db.matchEvent.matchId.filter(match.id)] : [];
    });
  },
);
