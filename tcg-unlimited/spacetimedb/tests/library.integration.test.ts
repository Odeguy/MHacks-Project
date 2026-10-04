import { afterAll, describe, expect, it } from "vitest";
import { DbConnection, tables } from "../../src/module_bindings";

const connections: DbConnection[] = [];
const enabled = process.env.TCG_BACKEND_INTEGRATION === "1";
async function connect(): Promise<DbConnection> {
  const host = process.env.TCG_TEST_HOST ?? "ws://127.0.0.1:3199";
  const database = process.env.TCG_TEST_DATABASE ?? "tcg-backend-test";
  if (
    !/^ws:\/\/(127\.0\.0\.1|localhost):\d+$/.test(host) ||
    !database.startsWith("tcg-backend-test")
  )
    throw new Error("Use an isolated local test database");
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .onConnect((c) => {
        connections.push(c);
        c.subscriptionBuilder()
          .onApplied(() => resolve(c))
          .onError((ctx) => reject(ctx.event))
          .subscribe([
            tables.publishedGame,
            tables.deletedGame,
            tables.gameVersion,
            tables.myDrafts,
            tables.myDecks,
            tables.room,
            tables.myMemberships,
            tables.myMatches,
          ]);
      })
      .onConnectError((_ctx, error) => reject(error))
      .build();
  });
}
const poll = (check: () => boolean) =>
  expect.poll(check, { timeout: 5000 }).toBe(true);
describe.runIf(enabled)("library deletion", () => {
  afterAll(() => connections.forEach((c) => c.disconnect()));
  it("authorizes owners, rolls back invalid batches, clears lobby selections and retains published versions", async () => {
    const alice = await connect(),
      bob = await connect();
    const requestId = `library-${Date.now()}`;
    await alice.reducers.createExampleDraft({ requestId });
    await poll(() =>
      [...alice.db.myDrafts.iter()].some((d) => d.requestId === requestId),
    );
    const draft = [...alice.db.myDrafts.iter()].find(
      (d) => d.requestId === requestId,
    )!;
    await alice.reducers.validateGameDraft({
      draftId: draft.id,
      expectedRevision: 1,
    });
    await alice.reducers.publishGame({
      draftId: draft.id,
      expectedRevision: 1,
      gameId: undefined,
    });
    await poll(() =>
      [...alice.db.gameVersion.iter()].some((v) => v.draftId === draft.id),
    );
    const version = [...alice.db.gameVersion.iter()].find(
      (v) => v.draftId === draft.id,
    )!;
    const save = async (c: DbConnection, suffix: string) => {
      await c.reducers.saveDeck({
        deckId: undefined,
        expectedRevision: undefined,
        requestId: requestId + suffix,
        versionId: version.id,
        name: suffix,
        entries: version.definition.starterDecks[0].entries,
      });
      await poll(() =>
        [...c.db.myDecks.iter()].some(
          (d) => d.requestId === requestId + suffix,
        ),
      );
      return [...c.db.myDecks.iter()].find(
        (d) => d.requestId === requestId + suffix,
      )!;
    };
    const owned = await save(alice, "owned"),
      other = await save(bob, "other");
    await expect(
      alice.reducers.deleteDecks({
        decks: [
          { deckId: owned.id, expectedRevision: owned.revision },
          { deckId: other.id, expectedRevision: other.revision },
        ],
      }),
    ).rejects.toThrow();
    expect(alice.db.myDecks.id.find(owned.id)).toBeTruthy();
    await alice.reducers.createRoom({
      requestId,
      versionId: version.id,
      name: "Library room",
    });
    await poll(() =>
      [...alice.db.room.iter()].some((r) => r.requestId === requestId),
    );
    const room = [...alice.db.room.iter()].find(
      (r) => r.requestId === requestId,
    )!;
    await alice.reducers.selectDeck({ roomId: room.id, deckId: owned.id });
    await alice.reducers.setReady({ roomId: room.id, ready: true });
    await alice.reducers.deleteDecks({
      decks: [{ deckId: owned.id, expectedRevision: owned.revision }],
    });
    await poll(() => !alice.db.myDecks.id.find(owned.id));
    await poll(() =>
      [...alice.db.myMemberships.iter()].some(
        (m) => m.roomId === room.id && m.deckId === undefined && !m.ready,
      ),
    );
    await expect(
      bob.reducers.deleteGames({ gameIds: [version.gameId] }),
    ).rejects.toThrow("owned");
    await expect(
      alice.reducers.deleteGames({ gameIds: [version.gameId, 999999999n] }),
    ).rejects.toThrow();
    expect(alice.db.deletedGame.gameId.find(version.gameId)).toBeFalsy();
    await alice.reducers.deleteGames({ gameIds: [version.gameId] });
    await poll(() => !!alice.db.deletedGame.gameId.find(version.gameId));
    expect(alice.db.gameVersion.id.find(version.id)).toBeTruthy();
    expect(alice.db.room.id.find(room.id)).toBeTruthy();
    expect(bob.db.myDecks.id.find(other.id)).toBeTruthy();
    await expect(
      alice.reducers.createRoom({
        requestId: requestId + "deleted",
        versionId: version.id,
        name: "Deleted game",
      }),
    ).rejects.toThrow("deleted");
  });
});
