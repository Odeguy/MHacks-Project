import { afterAll, describe, expect, it } from "vitest";
import { DbConnection, tables } from "../../src/module_bindings";
import {
  exampleDocument as newDocument,
  changeTypeFormat,
  syncDocument,
  blankAbility,
  blankEffect,
} from "../../src/designer-model";
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
            tables.myDraftSpecialRules,
            tables.versionSpecialRules,
            tables.gameVersion,
            tables.publishedGame,
            tables.myDecks,
            tables.room,
            tables.myMemberships,
            tables.myMatches,
            tables.myReactionWindows,
            tables.visibleMatchCards,
            tables.matchPlayers,
          ]);
      })
      .onConnectError((_, error) => reject(error))
      .build();
  });
}
describe.runIf(enabled)("live reactions and field rules", () => {
  afterAll(() => connections.forEach((c) => c.disconnect()));
  it("enforces priority, private views, passing/timeouts, immutable rules, field removal, and stale revisions", async () => {
    const alice = await connect(),
      bob = await connect(),
      charlie = await connect(),
      outsider = await connect();
    const clients = [alice, bob, charlie],
      requestId = `special-${Date.now()}`;
    let doc = newDocument();
    doc = changeTypeFormat(doc, "relic", "field_effect");
    doc = changeTypeFormat(doc, "effect", "trap_reaction");
    const trap = doc.definition.cards.find((c) => c.formatId === "effect")!;
    const ability = blankAbility(trap.id);
    ability.targetKind = "self";
    ability.effects = [
      { ...blankEffect("gain_resource"), target: "actor", amount: 3 },
    ];
    trap.actionIds.push(ability.id);
    doc.definition.actions.push(ability);
    doc.definition.participants.maximum = 3;
    doc.definition.hand = { initial: 12, maximum: 12 };
    doc.definition.setup.startingResource = 100;
    doc.rules.playsPerTurn = 200;
    doc.rules.phases[0].steps.find((s) => s.kind === "play")!.maximum = 200;
    doc = syncDocument(doc);
    doc.special.reactions[0].onActions = ["attack"];
    doc.rules.phases[1].steps.find((s) => s.kind === "attack")!.maximum = 200;
    doc.special.fields[0].modifiers = [
      { kind: "atk", scope: "all", amount: 2, formatId: "" },
      { kind: "action_cost", scope: "all", amount: 1, formatId: "" },
    ];
    await alice.reducers.createGameDraft({
      requestId,
      title: "Reaction field test",
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
      expectedRevision: 1,
      title: draft.title,
      description: "",
      definition: doc.definition,
      rules: doc.rules,
      special: doc.special,
    };
    await expect(
      bob.reducers.updateSpecialDesignerDraft(update),
    ).rejects.toThrow("owned");
    await alice.reducers.updateSpecialDesignerDraft(update);
    await poll(() => !!alice.db.myDraftSpecialRules.draftId.find(draft.id));
    expect([...bob.db.myDraftSpecialRules.iter()]).toHaveLength(0);
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
    await poll(() => !!alice.db.versionSpecialRules.versionId.find(version.id));
    expect(
      alice.db.versionSpecialRules.versionId.find(version.id)!.rules,
    ).toEqual(doc.special);
    const deckIds: bigint[] = [];
    for (const [seat, c] of clients.entries()) {
      await c.reducers.saveDeck({
        deckId: undefined,
        expectedRevision: undefined,
        requestId: `${requestId}-${seat}`,
        versionId: version.id,
        name: "Test deck",
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
      deckIds.push(
        [...c.db.myDecks.iter()].find(
          (d) => d.requestId === `${requestId}-${seat}`,
        )!.id,
      );
    }
    await alice.reducers.createRoom({
      requestId,
      versionId: version.id,
      name: "Special test room",
    });
    await poll(() =>
      [...alice.db.room.iter()].some((r) => r.requestId === requestId),
    );
    const room = [...alice.db.room.iter()].find(
      (r) => r.requestId === requestId,
    )!;
    await bob.reducers.joinRoom({ roomId: room.id });
    await charlie.reducers.joinRoom({ roomId: room.id });
    for (const [seat, c] of clients.entries()) {
      await c.reducers.selectDeck({ roomId: room.id, deckId: deckIds[seat] });
      await c.reducers.setReady({ roomId: room.id, ready: true });
    }
    await alice.reducers.startMatch({ roomId: room.id });
    await poll(() =>
      [...alice.db.myMatches.iter()].some((m) => m.roomId === room.id),
    );
    const matchId = [...alice.db.myMatches.iter()].find(
      (m) => m.roomId === room.id,
    )!.id;
    const current = (c = alice) => c.db.myMatches.id.find(matchId)!;
    const card = (c: DbConnection, cardId: string, zone = "hand") =>
      [...c.db.visibleMatchCards.iter()].find(
        (v) =>
          v.matchId === matchId &&
          v.cardId === cardId &&
          v.zone === zone &&
          v.ownerSeat === clients.indexOf(c),
      )!;
    const action = async (
      c: DbConnection,
      actionId: string,
      source?: number,
      slot?: string,
      target?: number,
      targetSeat?: number,
    ) => {
      await poll(
        () => !!current(c) && current(c).revision === current().revision,
      );
      const revision = current(c).revision;
      await c.reducers.takeAction({
        matchId,
        expectedRevision: revision,
        input: {
          actionId,
          sourceInstanceId: source,
          slotId: slot,
          targetInstanceId: target,
          targetSeat,
        },
      });
      await poll(() => current().revision > revision);
    };
    const advance = async (c: DbConnection, count = 3) => {
      for (let i = 0; i < count; i++) {
        await poll(() => current(c).revision === current().revision);
        const revision = current(c).revision;
        await c.reducers.advanceTurnPhase({
          matchId,
          expectedRevision: revision,
        });
        await poll(() => current().revision > revision);
      }
    };
    const fighterId = doc.definition.cards[0].id,
      fieldId = doc.special.fields[0].cardId;
    await action(alice, "play", card(alice, fieldId).instanceId, "slot_3");
    await action(alice, "play", card(alice, fighterId).instanceId, "slot_0");
    await action(alice, "play", card(alice, fighterId).instanceId, "slot_1");
    expect(
      card(alice, fighterId, "field").values.find((v) => v.key === "atk")!
        .numberValue,
    ).toBe(5);
    await advance(alice);
    await action(bob, "play", card(bob, trap.id).instanceId, "slot_3");
    await action(bob, "play", card(bob, fighterId).instanceId, "slot_0");
    await advance(bob);
    await action(charlie, "play", card(charlie, trap.id).instanceId, "slot_3");
    await advance(charlie);
    await advance(alice, 1);
    await action(
      alice,
      "attack_player",
      card(alice, fighterId, "field").instanceId,
      undefined,
      undefined,
      1,
    );
    await poll(
      () =>
        alice.db.myReactionWindows.matchId.find(matchId)?.responseSeat === 1,
    );
    expect([...outsider.db.myReactionWindows.iter()]).toHaveLength(0);
    expect(
      [...bob.db.visibleMatchCards.iter()].some(
        (v) => v.matchId === matchId && v.ownerSeat === 0 && v.zone === "hand",
      ),
    ).toBe(false);
    const stale = current().revision;
    await expect(
      alice.reducers.advanceTurnPhase({ matchId, expectedRevision: stale }),
    ).rejects.toThrow("reactions");
    await expect(
      charlie.reducers.passReaction({ matchId, expectedRevision: stale }),
    ).rejects.toThrow("responder");
    await expect(
      outsider.reducers.passReaction({ matchId, expectedRevision: stale }),
    ).rejects.toThrow();
    const bobResources = [...bob.db.matchPlayers.iter()].find(
      (p) => p.matchId === matchId && p.seat === 1,
    )!.resource;
    await poll(() => current(bob).revision === stale);
    await bob.reducers.reactToAction({
      matchId,
      expectedRevision: stale,
      input: {
        actionId: ability.id,
        sourceInstanceId: card(bob, trap.id, "field").instanceId,
        targetSeat: undefined,
        targetInstanceId: undefined,
        slotId: undefined,
      },
    });
    await poll(
      () =>
        alice.db.myReactionWindows.matchId.find(matchId)?.responseSeat === 2,
    );
    await poll(
      () =>
        [...bob.db.matchPlayers.iter()].find(
          (p) => p.matchId === matchId && p.seat === 1,
        )!.resource ===
        bobResources + 2,
    );
    expect(card(bob, trap.id, "discard")).toBeDefined();
    expect(current().activeSeat).toBe(0);
    await poll(() => current(charlie).revision === current().revision);
    await charlie.reducers.passReaction({
      matchId,
      expectedRevision: current(charlie).revision,
    });
    await poll(() => !alice.db.myReactionWindows.matchId.find(matchId));
    await expect(
      alice.reducers.advanceTurnPhase({ matchId, expectedRevision: stale }),
    ).rejects.toThrow("Match changed");
    const secondFighter = [...alice.db.visibleMatchCards.iter()].find(
      (v) =>
        v.matchId === matchId &&
        v.cardId === fighterId &&
        v.zone === "field" &&
        v.slotId === "slot_1" &&
        v.ownerSeat === 0,
    )!;
    await action(
      alice,
      "attack_player",
      secondFighter.instanceId,
      undefined,
      undefined,
      1,
    );
    await poll(
      () =>
        alice.db.myReactionWindows.matchId.find(matchId)?.responseSeat === 2,
    );
    await expect(
      alice.reducers.passReaction({
        matchId,
        expectedRevision: current().revision,
      }),
    ).rejects.toThrow("responder");
    // Verify the server deadline, rather than mocking client time or bypassing private state.
    await new Promise((resolve) => setTimeout(resolve, 30_200));
    await alice.reducers.passReaction({
      matchId,
      expectedRevision: current().revision,
    });
    await poll(() => !alice.db.myReactionWindows.matchId.find(matchId));
    await advance(alice, 2);
    await advance(bob, 1);
    const fieldInstance = [...bob.db.visibleMatchCards.iter()].find(
      (v) =>
        v.matchId === matchId &&
        v.cardId === fieldId &&
        v.zone === "field" &&
        v.ownerSeat === 0,
    )!.instanceId;
    await action(
      bob,
      "attack_card",
      card(bob, fighterId, "field").instanceId,
      undefined,
      fieldInstance,
    );
    await poll(() => card(alice, fieldId, "discard") !== undefined);
    expect(
      card(bob, fighterId, "field").values.find((v) => v.key === "atk")!
        .numberValue,
    ).toBe(3);
    // Destruction can open Charlie's remaining Trap window; finish it cleanly.
    if (alice.db.myReactionWindows.matchId.find(matchId)) {
      await poll(() => current(charlie).revision === current().revision);
      const revision = current(charlie).revision;
      await charlie.reducers.passReaction({
        matchId,
        expectedRevision: revision,
      });
      await poll(() => current().revision === revision + 1);
    }
    expect(
      alice.db.versionSpecialRules.versionId.find(version.id)!.rules,
    ).toEqual(doc.special);
    const beforeConcession = current().revision;
    await alice.reducers.concedeMatch({
      matchId,
      expectedRevision: beforeConcession,
    });
    await poll(() => current().revision === beforeConcession + 1);
    await poll(() => current(bob).revision === current().revision);
    await bob.reducers.concedeMatch({
      matchId,
      expectedRevision: current(bob).revision,
    });
    await poll(() => current().status === "finished");
  }, 60000);
});
