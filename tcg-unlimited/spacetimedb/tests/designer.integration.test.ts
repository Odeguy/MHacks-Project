import { afterAll, describe, expect, it } from "vitest";
import { DbConnection, tables } from "../../src/module_bindings";
import { newDocument, syncDocument } from "../../src/designer-model";
const enabled = process.env.TCG_BACKEND_INTEGRATION === "1";
const host = process.env.TCG_TEST_HOST ?? "ws://127.0.0.1:3199";
const database = process.env.TCG_TEST_DATABASE ?? "tcg-backend-test";
const connections: DbConnection[] = [];
const poll = (check: () => boolean) =>
  expect.poll(check, { timeout: 5000 }).toBe(true);
function connect() {
  if (
    !/^ws:\/\/(127\.0\.0\.1|localhost):\d+$/.test(host) ||
    !database.startsWith("tcg-backend-test")
  )
    throw new Error("Use an isolated local test database");
  return new Promise<DbConnection>((resolve, reject) => {
    DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .onConnect((c) => {
        connections.push(c);
        c.subscriptionBuilder()
          .onApplied(() => resolve(c))
          .onError((ctx) => reject(ctx.event))
          .subscribe([
            tables.myDrafts,
            tables.myDraftRules,
            tables.versionRules,
            tables.gameVersion,
            tables.publishedGame,
            tables.myDecks,
            tables.room,
            tables.myMemberships,
            tables.myMatches,
            tables.visibleMatchCards,
            tables.matchPlayers,
          ]);
      })
      .onConnectError((_, error) => reject(error))
      .build();
  });
}
describe.runIf(enabled)("published designer rules on SpacetimeDB", () => {
  afterAll(() => connections.forEach((c) => c.disconnect()));
  it("persists private drafts and immutable rule versions, enforcing live budgets and hand sizes", async () => {
    const alice = await connect(),
      bob = await connect();
    const requestId = `designer-${Date.now()}`;
    const doc = newDocument();
    doc.definition.startingHealth = 37;
    doc.rules.healthName = "Vitality";
    doc.definition.hand.maximum = 5;
    doc.definition.setup.turnDraw = 2;
    doc.rules.playsPerTurn = 1;
    doc.rules.phases[0].ordered = true;
    const prepared = syncDocument(doc);
    await alice.reducers.createGameDraft({
      requestId,
      title: "Rule test",
      description: "",
    });
    await poll(() =>
      [...alice.db.myDrafts.iter()].some((d) => d.requestId === requestId),
    );
    const draft = [...alice.db.myDrafts.iter()].find(
      (d) => d.requestId === requestId,
    )!;
    await alice.reducers.updateDesignerDraft({
      draftId: draft.id,
      expectedRevision: draft.revision,
      title: "Rule test",
      description: "",
      definition: prepared.definition,
      rules: prepared.rules,
    });
    await poll(() => !!alice.db.myDraftRules.draftId.find(draft.id));
    expect([...bob.db.myDraftRules.iter()]).toHaveLength(0);
    await expect(
      bob.reducers.updateDesignerDraft({
        draftId: draft.id,
        expectedRevision: 2,
        title: "Take over",
        description: "",
        definition: prepared.definition,
        rules: prepared.rules,
      }),
    ).rejects.toThrow("owned");
    await alice.reducers.validateGameDraft({
      draftId: draft.id,
      expectedRevision: 2,
    });
    await alice.reducers.publishGame({
      draftId: draft.id,
      expectedRevision: 2,
      gameId: undefined,
    });
    await poll(() =>
      [...alice.db.gameVersion.iter()].some((v) => v.draftId === draft.id),
    );
    const version = [...alice.db.gameVersion.iter()].find(
      (v) => v.draftId === draft.id,
    )!;
    await poll(() => !!alice.db.versionRules.versionId.find(version.id));
    expect(
      alice.db.versionRules.versionId.find(version.id)?.rules.healthName,
    ).toBe("Vitality");
    const entries = prepared.definition.cards.map((card) => ({
      cardId: card.id,
      quantity: 2,
    }));
    for (const [index, player] of [alice, bob].entries()) {
      await player.reducers.saveDeck({
        deckId: undefined,
        expectedRevision: undefined,
        requestId: `${requestId}-${index}`,
        versionId: version.id,
        name: "Complete deck",
        entries,
      });
      await poll(() =>
        [...player.db.myDecks.iter()].some((d) => d.versionId === version.id),
      );
    }
    await alice.reducers.createRoom({
      requestId,
      name: "Rules room",
      versionId: version.id,
    });
    await poll(() =>
      [...alice.db.room.iter()].some((r) => r.requestId === requestId),
    );
    const room = [...alice.db.room.iter()].find(
      (r) => r.requestId === requestId,
    )!;
    await bob.reducers.joinRoom({ roomId: room.id });
    for (const player of [alice, bob]) {
      const deck = [...player.db.myDecks.iter()].find(
        (d) => d.versionId === version.id,
      )!;
      await player.reducers.selectDeck({ roomId: room.id, deckId: deck.id });
      await player.reducers.setReady({ roomId: room.id, ready: true });
    }
    await alice.reducers.startMatch({ roomId: room.id });
    await poll(() =>
      [...alice.db.myMatches.iter()].some((m) => m.roomId === room.id),
    );
    const current = () =>
      [...alice.db.myMatches.iter()].find((m) => m.roomId === room.id)!;
    const cards = [...alice.db.visibleMatchCards.iter()].filter(
      (c) => c.matchId === current().id && c.zone === "hand",
    );
    const slotFor = (cardId: string, excluded = "") =>
      prepared.rules.slots.find(
        (s) =>
          s.slotId !== excluded &&
          prepared.rules.cardSlots
            .find((c) => c.cardId === cardId)!
            .allowedTypeIds.includes(s.typeId),
      )!.slotId;
    const firstSlot = slotFor(cards[0].cardId);
    const take = (
      actionId: string,
      sourceInstanceId?: number,
      slotId?: string,
    ) =>
      alice.reducers.takeAction({
        matchId: current().id,
        expectedRevision: current().revision,
        input: {
          actionId,
          sourceInstanceId,
          slotId,
          targetSeat: undefined,
          targetInstanceId: undefined,
        },
      });
    await take("play", cards[0].instanceId, firstSlot);
    await poll(() => current().revision === 1);
    await expect(
      take("play", cards[1].instanceId, slotFor(cards[1].cardId, firstSlot)),
    ).rejects.toThrow("Plays per turn");
    expect(current().revision).toBe(1);
    await take("draw");
    await poll(() => current().revision === 2);
    await expect(take("draw")).rejects.toThrow("Phase action limit");
    await expect(
      take("play", cards[1].instanceId, slotFor(cards[1].cardId, firstSlot)),
    ).rejects.toThrow("action order");
    for (let i = 0; i < prepared.definition.phases.length; i++) {
      const revision = current().revision;
      await alice.reducers.advanceTurnPhase({
        matchId: current().id,
        expectedRevision: revision,
      });
      await poll(() => current().revision > revision);
    }
    await poll(() =>
      [...bob.db.matchPlayers.iter()].some(
        (p) => p.matchId === current().id && p.seat === 1 && p.handCount === 5,
      ),
    );
    expect(
      [...alice.db.visibleMatchCards.iter()]
        .filter((c) => c.matchId === current().id && c.zone === "hand")
        .every((c) => c.ownerSeat === 0),
    ).toBe(true);
    await alice.reducers.concedeMatch({
      matchId: current().id,
      expectedRevision: current().revision,
    });
    prepared.rules.healthName = "Energy";
    await alice.reducers.updateDesignerDraft({
      draftId: draft.id,
      expectedRevision: 2,
      title: "Updated rules",
      description: "",
      definition: prepared.definition,
      rules: prepared.rules,
    });
    await alice.reducers.validateGameDraft({
      draftId: draft.id,
      expectedRevision: 3,
    });
    await alice.reducers.publishGame({
      draftId: draft.id,
      expectedRevision: 3,
      gameId: version.gameId,
    });
    await poll(
      () =>
        [...alice.db.gameVersion.iter()].filter(
          (v) => v.gameId === version.gameId,
        ).length === 2,
    );
    expect(
      alice.db.versionRules.versionId.find(version.id)?.rules.healthName,
    ).toBe("Vitality");
    expect(
      [...alice.db.myDecks.iter()].find((d) => d.versionId === version.id),
    ).toBeDefined();
  });
});
