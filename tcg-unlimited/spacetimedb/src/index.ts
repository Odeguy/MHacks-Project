import { t } from "spacetimedb/server";
import db from "./schema";
import { run } from "./helpers";
import { text } from "./validation";
export default db;
export * from "./design";
export * from "./play";
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
  if (!ctx.db.user.identity.find(ctx.sender))
    ctx.db.user.insert({ identity: ctx.sender, name: undefined });
  if (ctx.connectionId)
    ctx.db.connection.insert({ id: ctx.connectionId, owner: ctx.sender });
});
export const onDisconnect = db.clientDisconnected((ctx) => {
  if (ctx.connectionId) ctx.db.connection.id.delete(ctx.connectionId);
});
