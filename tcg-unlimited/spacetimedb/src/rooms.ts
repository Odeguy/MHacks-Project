import { ScheduleAt, type Identity } from "spacetimedb";
import type { Ctx } from "./helpers";

export function removeRoomMember(ctx: Ctx, id: bigint) {
  const member = ctx.db.roomMember.id.find(id);
  if (!member) return;
  const room = ctx.db.room.id.find(member.roomId);
  ctx.db.roomMember.id.delete(id);
  if (!room) return;
  const remaining = [...ctx.db.roomMember.roomId.filter(room.id)].sort(
    (a, b) => a.seat - b.seat,
  );
  ctx.db.room.id.update({
    ...room,
    playerCount: remaining.length,
    status: remaining.length ? room.status : "closed",
    host:
      room.host.equals(member.owner) && remaining.length
        ? remaining[0].owner
        : room.host,
  });
}

export function leaveOtherLobbies(ctx: Ctx, owner: Identity, except?: bigint) {
  for (const member of [...ctx.db.roomMember.owner.filter(owner)]) {
    if (
      member.roomId !== except &&
      ctx.db.room.id.find(member.roomId)?.status === "lobby"
    )
      removeRoomMember(ctx, member.id);
  }
}

export function scheduleLobbyCleanup(ctx: Ctx, owner: Identity) {
  if (
    [...ctx.db.connection.owner.filter(owner)].length ||
    [...ctx.db.lobbyCleanup.owner.filter(owner)].length ||
    ![...ctx.db.roomMember.owner.filter(owner)].some(
      (member) => ctx.db.room.id.find(member.roomId)?.status === "lobby",
    )
  )
    return;
  ctx.db.lobbyCleanup.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(
      ctx.timestamp.microsSinceUnixEpoch + 30_000_000n,
    ),
    owner,
  });
}
