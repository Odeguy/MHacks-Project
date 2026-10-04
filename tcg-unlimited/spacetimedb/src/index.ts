import { t, SenderError } from "spacetimedb/server";
import db, { lobbyCleanup } from "./schema";
import { leaveOtherLobbies, scheduleLobbyCleanup } from "./rooms";
import { run } from "./helpers";
import { text } from "./validation";
export default db;
export * from "./design";
export * from "./play";
export * from "./library";
export * from "./views";
export const setName = db.reducer({ name: t.string() }, (ctx, a) =>
  run(() => {
    text(a.name, "Display name", 64);
    const user = ctx.db.user.identity.find(ctx.sender);
    if (user) ctx.db.user.identity.update({ ...user, name: a.name });
    else ctx.db.user.insert({ identity: ctx.sender, name: a.name });
  }),
);
export const onConnect = db.clientConnected((ctx) => {
  for (const timer of ctx.db.lobbyCleanup.owner.filter(ctx.sender))
    ctx.db.lobbyCleanup.scheduledId.delete(timer.scheduledId);
  if (!ctx.db.user.identity.find(ctx.sender))
    ctx.db.user.insert({ identity: ctx.sender, name: undefined });
  if (ctx.connectionId)
    ctx.db.connection.insert({ id: ctx.connectionId, owner: ctx.sender });
  // Also clean up offline lobbies left behind before this lifecycle was added.
  for (const member of ctx.db.roomMember.iter()) {
    if (ctx.db.room.id.find(member.roomId)?.status === "lobby")
      scheduleLobbyCleanup(ctx, member.owner);
  }
});
export const onDisconnect = db.clientDisconnected((ctx) => {
  if (ctx.connectionId) ctx.db.connection.id.delete(ctx.connectionId);
  if ([...ctx.db.connection.owner.filter(ctx.sender)].length) return;
  for (const member of ctx.db.roomMember.owner.filter(ctx.sender)) {
    if (ctx.db.room.id.find(member.roomId)?.status === "lobby")
      ctx.db.roomMember.id.update({ ...member, ready: false });
  }
  scheduleLobbyCleanup(ctx, ctx.sender);
});
export const cleanupDisconnectedLobbies = db.reducer(
  { onSchedule: lobbyCleanup },
  { timer: lobbyCleanup.rowType },
  (ctx, { timer }) => {
    if (ctx.connectionId) throw new SenderError("Scheduled cleanup only");
    if ([...ctx.db.connection.owner.filter(timer.owner)].length) return;
    leaveOtherLobbies(ctx, timer.owner);
  },
);
