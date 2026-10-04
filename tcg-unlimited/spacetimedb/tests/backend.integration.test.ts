import { afterAll, describe, expect, it } from "vitest";
import { DbConnection, tables } from "../../src/module_bindings";

// Opt in against a fresh local database; never run this suite against Maincloud.
const enabled = process.env.TCG_BACKEND_INTEGRATION === "1";
const host = process.env.TCG_TEST_HOST ?? "ws://127.0.0.1:3199";
const database = process.env.TCG_TEST_DATABASE ?? "tcg-backend-test";
const connections: DbConnection[] = [];
async function connect() {
  if (
    !/^ws:\/\/(127\.0\.0\.1|localhost):\d+$/.test(host) ||
    !database.startsWith("tcg-backend-test")
  )
    throw new Error(
      "Integration tests require an isolated local test database",
    );
  return new Promise<DbConnection>((resolve, reject) => {
    const conn = DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .onConnect((c) => {
        connections.push(c);
        c.subscriptionBuilder()
          .onApplied(() => resolve(c))
          .onError((ctx) => reject(ctx.event))
          .subscribe([
            tables.publishedGame,
            tables.gameVersion,
            tables.room,
            tables.myDrafts,
            tables.myDecks,
            tables.myMemberships,
            tables.roomParticipants,
            tables.myMatches,
            tables.matchPlayers,
            tables.visibleMatchCards,
            tables.matchHistory,
          ]);
      })
      .onConnectError((_, e) => reject(e))
      .build();
    // Keep the connection referenced while its handshake is pending.
    void conn;
  });
}
const poll = async (condition: () => boolean) =>
  expect.poll(condition, { timeout: 5000 }).toBe(true);

describe.runIf(enabled)("real SpacetimeDB reducers and private views", () => {
  afterAll(() => connections.forEach((c) => c.disconnect()));
  it("publishes immutable versions and enforces private ownership, readiness, and match actions", async () => {
    const alice = await connect();
    const bob = await connect();
    const outsider = await connect();
    const requestId = `integration-${Date.now()}`;
    await alice.reducers.createExampleDraft({ requestId });
    await poll(() =>
      [...alice.db.myDrafts.iter()].some((d) => d.requestId === requestId),
    );
    const draft = [...alice.db.myDrafts.iter()].find(
      (d) => d.requestId === requestId,
    )!;
    expect([...bob.db.myDrafts.iter()]).toHaveLength(0);
    await expect(
      bob.reducers.createLife({
        draftId: draft.id,
        expectedRevision: 1,
        startingHealth: 99,
      }),
    ).rejects.toThrow();
    await expect(
      alice.reducers.publishGame({
        draftId: draft.id,
        expectedRevision: 1,
        gameId: undefined,
      }),
    ).rejects.toThrow("Validate");
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
    const v1 = [...alice.db.gameVersion.iter()].find(
      (v) => v.draftId === draft.id,
    )!;
    await alice.reducers.publishGame({
      draftId: draft.id,
      expectedRevision: 1,
      gameId: undefined,
    });
    expect(
      [...alice.db.gameVersion.iter()].filter((v) => v.draftId === draft.id),
    ).toHaveLength(1);
    await alice.reducers.createLife({
      draftId: draft.id,
      expectedRevision: 1,
      startingHealth: 25,
    });
    await expect(
      alice.reducers.createLife({
        draftId: draft.id,
        expectedRevision: 1,
        startingHealth: 50,
      }),
    ).rejects.toThrow("changed");
    await alice.reducers.validateGameDraft({
      draftId: draft.id,
      expectedRevision: 2,
    });
    await alice.reducers.publishGame({
      draftId: draft.id,
      expectedRevision: 2,
      gameId: v1.gameId,
    });
    await poll(() =>
      [...alice.db.gameVersion.iter()].some(
        (v) => v.gameId === v1.gameId && v.version === 2,
      ),
    );
    expect(alice.db.gameVersion.id.find(v1.id)?.definition.startingHealth).toBe(
      20,
    );
    await poll(() => bob.db.gameVersion.id.find(v1.id) != null);
    const entries = v1.definition.starterDecks[0].entries;
    const save = async (c: DbConnection, suffix: string) => {
      await c.reducers.saveDeck({
        deckId: undefined,
        expectedRevision: undefined,
        requestId: requestId + suffix,
        versionId: v1.id,
        name: suffix,
        entries,
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
    const aDeck = await save(alice, "alice");
    const bDeck = await save(bob, "bob");
    expect([...bob.db.myDecks.iter()].some((d) => d.id === aDeck.id)).toBe(
      false,
    );
    await expect(
      bob.reducers.deleteDeck({ deckId: aDeck.id, expectedRevision: 1 }),
    ).rejects.toThrow();
    await alice.reducers.createRoom({
      requestId,
      versionId: v1.id,
      name: "Integration room",
    });
    await poll(() =>
      [...alice.db.room.iter()].some((r) => r.requestId === requestId),
    );
    const room = [...alice.db.room.iter()].find(
      (r) => r.requestId === requestId,
    )!;
    await bob.reducers.joinRoom({ roomId: room.id });
    await expect(
      outsider.reducers.joinRoom({ roomId: room.id }),
    ).rejects.toThrow("full");
    await expect(bob.reducers.startMatch({ roomId: room.id })).rejects.toThrow(
      "host",
    );
    await alice.reducers.selectDeck({ roomId: room.id, deckId: aDeck.id });
    await bob.reducers.selectDeck({ roomId: room.id, deckId: bDeck.id });
    await alice.reducers.setReady({ roomId: room.id, ready: true });
    await bob.reducers.setReady({ roomId: room.id, ready: true });
    await alice.reducers.saveDeck({
      deckId: aDeck.id,
      expectedRevision: 1,
      requestId: aDeck.requestId,
      versionId: v1.id,
      name: "Edited deck",
      entries,
    });
    await poll(
      () =>
        [...alice.db.myMemberships.iter()].find((m) => m.roomId === room.id)
          ?.ready === false,
    );
    await expect(
      alice.reducers.startMatch({ roomId: room.id }),
    ).rejects.toThrow("ready");
    await alice.reducers.setReady({ roomId: room.id, ready: true });
    await alice.reducers.startMatch({ roomId: room.id });
    await poll(() =>
      [...alice.db.myMatches.iter()].some((m) => m.roomId === room.id),
    );
    const match = [...alice.db.myMatches.iter()].find(
      (m) => m.roomId === room.id,
    )!;
    await poll(() => bob.db.myMatches.id.find(match.id) != null);
    expect([...outsider.db.myMatches.iter()]).toHaveLength(0);
    expect([...outsider.db.roomParticipants.iter()]).toHaveLength(0);
    expect([...outsider.db.visibleMatchCards.iter()]).toHaveLength(0);
    const cards = [...alice.db.visibleMatchCards.iter()].filter(
      (c) => c.matchId === match.id,
    );
    expect(cards).toHaveLength(3);
    expect(cards.every((c) => c.ownerSeat === 0 && c.zone === "hand")).toBe(
      true,
    );
    expect(
      [...bob.db.visibleMatchCards.iter()]
        .filter((c) => c.matchId === match.id)
        .every((c) => c.ownerSeat === 1),
    ).toBe(true);
    const blank = {
      actionId: "roll",
      sourceInstanceId: undefined,
      targetSeat: undefined,
      targetInstanceId: undefined,
      slotId: undefined,
    };
    await expect(
      outsider.reducers.takeAction({
        matchId: match.id,
        expectedRevision: 0,
        input: blank,
      }),
    ).rejects.toThrow("Join");
    await expect(
      bob.reducers.takeAction({
        matchId: match.id,
        expectedRevision: 0,
        input: blank,
      }),
    ).rejects.toThrow("turn");
    await alice.reducers.takeAction({
      matchId: match.id,
      expectedRevision: 0,
      input: {
        ...blank,
        actionId: "play",
        sourceInstanceId: cards[0].instanceId,
        slotId: "unit_0",
      },
    });
    await poll(() =>
      [...bob.db.visibleMatchCards.iter()].some(
        (c) =>
          c.matchId === match.id && c.zone === "field" && c.ownerSeat === 0,
      ),
    );
    await expect(
      alice.reducers.takeAction({
        matchId: match.id,
        expectedRevision: 0,
        input: blank,
      }),
    ).rejects.toThrow("changed");
    // Editing/deleting the saved recipe during a match leaves its card instances untouched.
    await alice.reducers.deleteDeck({ deckId: aDeck.id, expectedRevision: 2 });
    expect(
      [...alice.db.matchPlayers.iter()].find(
        (p) => p.matchId === match.id && p.seat === 0,
      )?.deckCount,
    ).toBe(3);
    await alice.reducers.takeAction({
      matchId: match.id,
      expectedRevision: 1,
      input: blank,
    });
    await poll(() =>
      [...alice.db.matchHistory.iter()].some(
        (e) =>
          e.matchId === match.id &&
          e.kind === "action" &&
          e.outcomes.length === 1,
      ),
    );
    await bob.reducers.concedeMatch({ matchId: match.id, expectedRevision: 2 });
    await poll(
      () => alice.db.myMatches.id.find(match.id)?.status === "finished",
    );
    expect(alice.db.myMatches.id.find(match.id)?.winnerSeat).toBe(0);
    expect(alice.db.room.id.find(room.id)?.status).toBe("finished");
    await bob.reducers.leaveRoom({ roomId: room.id });
    await poll(() => bob.db.myMatches.id.find(match.id) == null);
    expect(
      [...bob.db.visibleMatchCards.iter()].some((c) => c.matchId === match.id),
    ).toBe(false);
  });
});
