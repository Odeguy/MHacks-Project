import { t } from "spacetimedb/server";
import db from "./schema";
import { run } from "./helpers";
import { requireRule } from "./validation";

export const deleteGames = db.reducer({ gameIds: t.array(t.u64()) }, (ctx, a) =>
  run(() => {
    requireRule(
      a.gameIds.length > 0 && a.gameIds.length <= 100,
      "Select 1–100 games",
    );
    for (const id of new Set(a.gameIds)) {
      const game = ctx.db.publishedGame.id.find(id);
      requireRule(
        game?.owner.equals(ctx.sender),
        "Game not found or not owned by you",
      );
      if (!ctx.db.deletedGame.gameId.find(id))
        ctx.db.deletedGame.insert({ gameId: id, deletedAt: ctx.timestamp });
    }
  }),
);
