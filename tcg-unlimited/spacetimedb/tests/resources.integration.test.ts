import { afterAll, describe, expect, it } from "vitest";
import { DbConnection, tables } from "../../src/module_bindings";
import { exampleDocument, syncDocument } from "../../src/designer-model";
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
            tables.myDraftResourceRules,
            tables.versionResourceRules,
            tables.gameVersion,
            tables.myDecks,
            tables.room,
            tables.myMatches,
            tables.visibleMatchCards,
            tables.myMatchResourceBalances,
          ]);
      })
      .onConnectError((_, error) => reject(error))
      .build();
  });
}
describe.runIf(enabled)("live resource pools", () => {
  afterAll(() => connections.forEach((c) => c.disconnect()));
  it("persists immutable configuration, enforces independent costs and turn gains, and protects match views", async () => {
    const alice = await connect(),
      bob = await connect(),
      outsider = await connect();
    const doc = exampleDocument(),
      requestId = `resource-${Date.now()}`;
    doc.definition.hand = { initial: 12, maximum: 12 };
    doc.resources = {
      enabled: true,
      pools: [
        { id: "red", name: "Red mana", starting: 5, perTurn: 2 },
        { id: "blue", name: "Blue mana", starting: 3, perTurn: 1 },
      ],
      costs: [],
      effects: [],
    };
    const play = doc.definition.actions.find((a) => a.kind === "play")!;
    const firstCard = doc.definition.cards[0];
    doc.resources.costs.push({
      actionId: play.id,
      cardId: firstCard.id,
      amounts: [
        { poolId: "red", amount: 2 },
        { poolId: "blue", amount: 3 },
      ],
    });
    Object.assign(doc, syncDocument(doc));
    await alice.reducers.createGameDraft({
      requestId,
      title: "Resource test",
      description: "",
    });
    await poll(() =>
      [...alice.db.myDrafts.iter()].some((d) => d.requestId === requestId),
    );
    const draft = [...alice.db.myDrafts.iter()].find(
      (d) => d.requestId === requestId,
    )!;
    const update = {
      draftId: draft.id,
      expectedRevision: draft.revision,
      title: draft.title,
      description: "",
      definition: doc.definition,
      rules: doc.rules,
      special: doc.special,
      resources: doc.resources,
    };
    await expect(
      bob.reducers.updateResourceDesignerDraft(update),
    ).rejects.toThrow("owned");
    await alice.reducers.updateResourceDesignerDraft(update);
    await poll(() => !!alice.db.myDraftResourceRules.draftId.find(draft.id));
    expect([...bob.db.myDraftResourceRules.iter()]).toHaveLength(0);
    await alice.reducers.validateGameDraft({
      draftId: draft.id,
      expectedRevision: 2,
    });
    await poll(
      () =>
        alice.db.myDrafts.id.find(draft.id)?.validatedRevision === 2 ||
        !!alice.db.myDrafts.id.find(draft.id)?.validationError,
    );
    expect(alice.db.myDrafts.id.find(draft.id)!.validationError).toBe("");
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
    await poll(
      () => !!alice.db.versionResourceRules.versionId.find(version.id),
    );
    expect(
      alice.db.versionResourceRules.versionId.find(version.id)!.rules,
    ).toEqual(doc.resources);
    const decks: bigint[] = [];
    for (const [seat, c] of [alice, bob].entries()) {
      await c.reducers.saveDeck({
        deckId: undefined,
        expectedRevision: undefined,
        requestId: `${requestId}-${seat}`,
        versionId: version.id,
        name: "Resource deck",
        entries: doc.definition.cards.map((card) => ({
          cardId: card.id,
          quantity: 2,
        })),
      });
      await poll(() =>
        [...c.db.myDecks.iter()].some(
          (d) => d.requestId === `${requestId}-${seat}`,
        ),
      );
      decks.push(
        [...c.db.myDecks.iter()].find(
          (d) => d.requestId === `${requestId}-${seat}`,
        )!.id,
      );
    }
    await alice.reducers.createRoom({
      requestId,
      versionId: version.id,
      name: "Resource test",
    });
    await poll(() =>
      [...alice.db.room.iter()].some((r) => r.requestId === requestId),
    );
    const room = [...alice.db.room.iter()].find(
      (r) => r.requestId === requestId,
    )!;
    await bob.reducers.joinRoom({ roomId: room.id });
    for (const [seat, c] of [alice, bob].entries()) {
      await c.reducers.selectDeck({ roomId: room.id, deckId: decks[seat] });
      await c.reducers.setReady({ roomId: room.id, ready: true });
    }
    await alice.reducers.startMatch({ roomId: room.id });
    await poll(() =>
      [...alice.db.myMatches.iter()].some((m) => m.roomId === room.id),
    );
    const matchId = [...alice.db.myMatches.iter()].find(
      (m) => m.roomId === room.id,
    )!.id;
    const current = () => alice.db.myMatches.id.find(matchId)!;
    const balance = (seat: number, poolId: string) =>
      alice.db.myMatchResourceBalances.matchId
        .find(matchId)
        ?.balances.find((p) => p.seat === seat)
        ?.amounts.find((a) => a.poolId === poolId)?.amount;
    await poll(() => balance(0, "blue") === 3);
    expect([...outsider.db.myMatchResourceBalances.iter()]).toHaveLength(0);
    const copies = [...alice.db.visibleMatchCards.iter()].filter(
      (c) =>
        c.matchId === matchId &&
        c.ownerSeat === 0 &&
        c.cardId === firstCard.id &&
        c.zone === "hand",
    );
    const slot = doc.definition.field.slots.find(
      (s) =>
        s.allowedFormatIds.length === 0 ||
        s.allowedFormatIds.includes(firstCard.formatId),
    )!;
    const actionInput = {
      actionId: play.id,
      sourceInstanceId: copies[0].instanceId,
      targetSeat: undefined,
      targetInstanceId: undefined,
      slotId: slot.id,
    };
    await alice.reducers.takeAction({
      matchId,
      expectedRevision: current().revision,
      input: actionInput,
    });
    await poll(() => balance(0, "blue") === 0);
    expect(balance(0, "red")).toBe(3);
    await expect(
      alice.reducers.takeAction({
        matchId,
        expectedRevision: current().revision,
        input: {
          ...actionInput,
          sourceInstanceId: copies[1].instanceId,
          slotId: doc.definition.field.slots.filter(
            (s) =>
              s.allowedFormatIds.length === 0 ||
              s.allowedFormatIds.includes(firstCard.formatId),
          )[1].id,
        },
      }),
    ).rejects.toThrow("Blue mana");
    expect(balance(0, "red")).toBe(3);
    while (current().activeSeat === 0) {
      const revision = current().revision;
      await alice.reducers.advanceTurnPhase({
        matchId,
        expectedRevision: revision,
      });
      await poll(() => current().revision > revision);
    }
    await poll(() => balance(1, "red") === 7 && balance(1, "blue") === 4);
    await alice.reducers.updateResourceDesignerDraft({
      ...update,
      expectedRevision: 2,
      resources: { ...doc.resources, enabled: false },
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
    await poll(() =>
      [...alice.db.gameVersion.iter()].some(
        (v) => v.draftId === draft.id && v.draftRevision === 3,
      ),
    );
    const next = [...alice.db.gameVersion.iter()].find(
      (v) => v.draftId === draft.id && v.draftRevision === 3,
    )!;
    await poll(
      () =>
        alice.db.versionResourceRules.versionId.find(next.id)?.rules.enabled ===
        false,
    );
    expect(
      alice.db.versionResourceRules.versionId.find(version.id)!.rules.enabled,
    ).toBe(true);
    await bob.reducers.concedeMatch({
      matchId,
      expectedRevision: current().revision,
    });
  });
});
