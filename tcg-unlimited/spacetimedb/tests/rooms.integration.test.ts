import { afterAll, describe, expect, it } from "vitest";
import { DbConnection, tables } from "../../src/module_bindings";

const enabled = process.env.TCG_BACKEND_INTEGRATION === "1";
const host = process.env.TCG_TEST_HOST ?? "ws://127.0.0.1:3199";
const database = process.env.TCG_TEST_DATABASE ?? "tcg-backend-test";
const clients: DbConnection[] = [];
async function connect(token?: string) {
  if (
    !/^ws:\/\/(localhost|127\.0\.0\.1):\d+$/.test(host) ||
    !database.startsWith("tcg-backend-test")
  )
    throw new Error("Use an isolated local test database");
  return new Promise<{ conn: DbConnection; token: string }>(
    (resolve, reject) => {
      DbConnection.builder()
        .withUri(host)
        .withDatabaseName(database)
        .withToken(token)
        .onConnect((conn, _, freshToken) => {
          clients.push(conn);
          conn
            .subscriptionBuilder()
            .onApplied(() => resolve({ conn, token: freshToken }))
            .onError((ctx) => reject(ctx.event))
            .subscribe([
              tables.myDrafts,
              tables.publishedGame,
              tables.gameVersion,
              tables.room,
              tables.myMemberships,
              tables.roomParticipants,
            ]);
        })
        .onConnectError((_, err) => reject(err))
        .build();
    },
  );
}
const poll = (fn: () => boolean, timeout = 5000) =>
  expect.poll(fn, { timeout }).toBe(true);
describe.runIf(enabled)("room lifecycle", () => {
  afterAll(() => clients.forEach((c) => c.disconnect()));
  it("updates counts/hosts on leave, replaces previous lobbies, and cleans up disconnected members without losing reconnects", async () => {
    const alice = await connect(),
      bob = await connect(),
      observer = await connect();
    const a = alice.conn,
      b = bob.conn,
      o = observer.conn;
    const requestId = `rooms-${Date.now()}`;
    await a.reducers.createExampleDraft({ requestId });
    await poll(() =>
      [...a.db.myDrafts.iter()].some((d) => d.requestId === requestId),
    );
    const draft = [...a.db.myDrafts.iter()].find(
      (d) => d.requestId === requestId,
    )!;
    await a.reducers.validateGameDraft({
      draftId: draft.id,
      expectedRevision: 1,
    });
    await a.reducers.publishGame({
      draftId: draft.id,
      expectedRevision: 1,
      gameId: undefined,
    });
    await poll(() =>
      [...a.db.gameVersion.iter()].some((v) => v.draftId === draft.id),
    );
    const version = [...a.db.gameVersion.iter()].find(
      (v) => v.draftId === draft.id,
    )!;
    async function room(suffix: string) {
      const id = `${requestId}-${suffix}`;
      await a.reducers.createRoom({
        requestId: id,
        versionId: version.id,
        name: "Room lifecycle test",
      });
      await poll(() => [...o.db.room.iter()].some((r) => r.requestId === id));
      return [...o.db.room.iter()].find((r) => r.requestId === id)!;
    }
    const first = await room("first");
    await b.reducers.joinRoom({ roomId: first.id });
    await poll(() => o.db.room.id.find(first.id)?.playerCount === 2);
    await a.reducers.leaveRoom({ roomId: first.id });
    await poll(() => o.db.room.id.find(first.id)?.playerCount === 1);
    expect(o.db.room.id.find(first.id)!.host.equals(b.identity!)).toBe(true);
    await b.reducers.leaveRoom({ roomId: first.id });
    await poll(() => o.db.room.id.find(first.id)?.status === "closed");
    expect(o.db.room.id.find(first.id)!.playerCount).toBe(0);
    const replaced = await room("old");
    const current = await room("new");
    await poll(() => o.db.room.id.find(replaced.id)?.status === "closed");
    await b.reducers.joinRoom({ roomId: current.id });
    const otherTab = await connect(alice.token);
    a.disconnect(); // One remaining tab must keep Alice's membership.
    b.disconnect();
    otherTab.conn.disconnect();
    const reconnected = await connect(alice.token); // Cancel Alice's pending cleanup.
    await poll(() =>
      [...reconnected.conn.db.myMemberships.iter()].some(
        (m) => m.roomId === current.id,
      ),
    );
    await poll(() => o.db.room.id.find(current.id)?.playerCount === 1, 35_000);
    expect(o.db.room.id.find(current.id)!.status).toBe("lobby");
    expect(
      o.db.room.id.find(current.id)!.host.equals(reconnected.conn.identity!),
    ).toBe(true);
    await reconnected.conn.reducers.leaveRoom({ roomId: current.id });
    await poll(() => o.db.room.id.find(current.id)?.status === "closed");
    expect(o.db.room.id.find(current.id)!.playerCount).toBe(0);
  }, 45_000);
});
