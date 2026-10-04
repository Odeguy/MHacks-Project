import { describe, expect, it } from "vitest";
import {
  exampleDocument,
  newDocument,
  syncDocument,
  blankEffect,
  blankAbility,
  documentFromDefinition,
} from "../../src/designer-model";
import { initializeMatch, performAction, advancePhase } from "../src/engine";
import {
  initializeResources,
  resourceValue,
  resourceCosts,
  validateResourceRules,
  canAfford,
} from "../src/resources";
import type { ActionInput, ResourceRules } from "../src/contracts";
import { reactionActions, performReaction } from "../src/reactions";

const rng = (_min: number, max: number) => max;
const input = (
  actionId: string,
  extra: Partial<ActionInput> = {},
): ActionInput => ({
  actionId,
  sourceInstanceId: undefined,
  targetInstanceId: undefined,
  targetSeat: undefined,
  slotId: undefined,
  ...extra,
});
function fixture() {
  const doc = exampleDocument();
  doc.resources = {
    enabled: true,
    pools: [
      { id: "red", name: "Red mana", starting: 5, perTurn: 2 },
      { id: "blue", name: "Blue mana", starting: 3, perTurn: 1 },
    ],
    costs: [],
    effects: [],
  };
  const game = doc.definition;
  const state = initializeMatch(
    game,
    [0, 1].map((seat) => ({
      seat,
      deckId: BigInt(seat + 1),
      revision: 1,
      entries: game.cards.map((c) => ({ cardId: c.id, quantity: 2 })),
    })),
    rng,
  );
  const resources = initializeResources(state, doc.resources);
  const card = state.cards.find((c) => c.ownerSeat === 0 && c.zone === "hand")!;
  const play = game.actions.find((a) => a.kind === "play")!;
  const playInput = input(play.id, {
    sourceInstanceId: card.id,
    slotId: game.field.slots.find(
      (s) =>
        s.allowedFormatIds.length === 0 ||
        s.allowedFormatIds.includes(
          game.cards.find((c) => c.id === card.cardId)!.formatId,
        ),
    )!.id,
  });
  return { doc, game, state, resources, card, play, playInput };
}
describe("optional independent resource pools", () => {
  it("starts new designs with resources disabled and preserves legacy designs", () => {
    expect(newDocument().resources.enabled).toBe(false);
    const game = exampleDocument().definition;
    expect(
      documentFromDefinition("Old game", "", game).resources.pools[0].starting,
    ).toBe(game.setup.startingResource);
  });
  it("pays all per-card costs atomically without altering another player's pools", () => {
    const f = fixture();
    f.resources.rules.costs.push({
      actionId: f.play.id,
      cardId: f.card.cardId,
      amounts: [
        { poolId: "red", amount: 2 },
        { poolId: "blue", amount: 3 },
      ],
    });
    const result = performAction(f.game, f.state, 0, 0, f.playInput, rng, {
      resources: f.resources,
    });
    const updated = { rules: f.resources.rules, balances: result.resources! };
    expect([
      resourceValue(updated, 0, "red"),
      resourceValue(updated, 0, "blue"),
      resourceValue(updated, 1, "red"),
    ]).toEqual([3, 0, 5]);
    expect(resourceValue(f.resources, 0, "blue")).toBe(3);
    expect(result.state.players[0].resource).toBe(3);
  });
  it("rejects an unaffordable pool with no deductions and respects explicitly free costs", () => {
    const f = fixture();
    f.resources.rules.costs.push({
      actionId: f.play.id,
      cardId: f.card.cardId,
      amounts: [
        { poolId: "red", amount: 1 },
        { poolId: "blue", amount: 4 },
      ],
    });
    expect(
      canAfford(
        f.game,
        f.state,
        0,
        f.play,
        f.card.cardId,
        undefined,
        f.resources,
      ),
    ).toBe(false);
    expect(() =>
      performAction(f.game, f.state, 0, 0, f.playInput, rng, {
        resources: f.resources,
      }),
    ).toThrow("Blue mana");
    expect(resourceValue(f.resources, 0, "red")).toBe(5);
    f.play.resourceCost = 100;
    f.resources.rules.costs[0].amounts = [];
    expect(resourceCosts(f.play, f.card.cardId, f.resources.rules)).toEqual([]);
  });
  it("routes gain/spend effects and conditions to their named pools", () => {
    const f = fixture();
    const first = f.play.effects.length;
    f.play.effects.push(
      { ...blankEffect("gain_resource"), target: "actor", amount: 4 },
      { ...blankEffect("spend_resource"), target: "actor", amount: 2 },
    );
    f.play.conditions.push({
      kind: "resource_at_least",
      target: "actor",
      key: "blue",
      value: 3,
    });
    f.resources.rules.effects.push(
      {
        interactionId: f.play.id,
        isTrigger: false,
        effectIndex: first,
        poolId: "blue",
      },
      {
        interactionId: f.play.id,
        isTrigger: false,
        effectIndex: first + 1,
        poolId: "red",
      },
    );
    const result = performAction(f.game, f.state, 0, 0, f.playInput, rng, {
      resources: f.resources,
    });
    const updated = { rules: f.resources.rules, balances: result.resources! };
    expect(resourceValue(updated, 0, "blue")).toBe(7);
    expect(resourceValue(updated, 0, "red")).toBe(3);
  });
  it("gains each pool only when its player's next turn starts", () => {
    const f = fixture();
    let state = f.state,
      resources = f.resources;
    while (state.activeSeat === 0) {
      const r = advancePhase(
        f.game,
        state,
        0,
        state.revision,
        rng,
        undefined,
        resources,
      );
      state = r.state;
      resources = { rules: resources.rules, balances: r.resources! };
    }
    expect([
      resourceValue(resources, 0, "red"),
      resourceValue(resources, 1, "red"),
      resourceValue(resources, 1, "blue"),
    ]).toEqual([5, 7, 4]);
  });
  it("disabling resources ignores costs, resource effects and resource conditions", () => {
    const f = fixture();
    f.resources.rules.enabled = false;
    f.play.resourceCost = 999;
    f.play.conditions.push({
      kind: "resource_at_least",
      target: "actor",
      key: "blue",
      value: 999,
    });
    f.play.effects.push({
      ...blankEffect("spend_resource"),
      target: "actor",
      amount: 999,
    });
    f.resources = initializeResources(f.state, f.resources.rules);
    const r = performAction(f.game, f.state, 0, 0, f.playInput, rng, {
      resources: f.resources,
    });
    expect(r.resources?.every((p) => p.amounts.length === 0)).toBe(true);
    expect(r.state.players.every((p) => p.resource === 0)).toBe(true);
  });
  it("applies field cost adjustments only to the primary pool", () => {
    const f = fixture();
    f.resources.rules.costs.push({
      actionId: f.play.id,
      cardId: f.card.cardId,
      amounts: [
        { poolId: "red", amount: 2 },
        { poolId: "blue", amount: 3 },
      ],
    });
    expect(resourceCosts(f.play, f.card.cardId, f.resources.rules, -1)).toEqual(
      [
        { poolId: "red", amount: 1 },
        { poolId: "blue", amount: 3 },
      ],
    );
  });
  it("routes triggered gains and rolls back deductions when a later effect fails", () => {
    const f = fixture();
    f.game.triggers.push({
      id: "blue_on_play",
      event: "played",
      conditions: [],
      effects: [
        { ...blankEffect("gain_resource"), target: "actor", amount: 2 },
      ],
    });
    f.game.cards
      .find((c) => c.id === f.card.cardId)!
      .triggerIds.push("blue_on_play");
    f.resources.rules.effects.push({
      interactionId: "blue_on_play",
      isTrigger: true,
      effectIndex: 0,
      poolId: "blue",
    });
    const r = performAction(f.game, f.state, 0, 0, f.playInput, rng, {
      resources: f.resources,
    });
    expect(
      resourceValue(
        { rules: f.resources.rules, balances: r.resources! },
        0,
        "blue",
      ),
    ).toBe(5);
    f.resources.rules.costs.push({
      actionId: f.play.id,
      cardId: f.card.cardId,
      amounts: [{ poolId: "red", amount: 1 }],
    });
    f.play.effects.push({
      ...blankEffect("spend_resource"),
      target: "actor",
      amount: 999,
    });
    expect(() =>
      performAction(f.game, f.state, 0, 0, f.playInput, rng, {
        resources: f.resources,
      }),
    ).toThrow("Red mana");
    expect(resourceValue(f.resources, 0, "red")).toBe(5);
    expect(f.state.cards.find((c) => c.id === f.card.id)!.zone).toBe("hand");
  });
  it("checks every pool for reactions and resolves their configured resource effects", () => {
    const f = fixture();
    const trap = f.state.cards.find((c) => c.ownerSeat === 1)!;
    trap.zone = "field";
    trap.slotId = f.game.field.slots[0].id;
    const ability = blankAbility(trap.cardId);
    ability.targetKind = "self";
    ability.effects = [
      { ...blankEffect("gain_resource"), target: "actor", amount: 2 },
    ];
    f.game.actions.push(ability);
    f.game.cards.find((c) => c.id === trap.cardId)!.actionIds.push(ability.id);
    const special = {
      fields: [],
      reactions: [
        { cardId: trap.cardId, onActions: ["attack"], discardAfterUse: true },
      ],
    };
    const cost = {
      actionId: ability.id,
      cardId: trap.cardId,
      amounts: [{ poolId: "blue", amount: 4 }],
    };
    f.resources.rules.costs.push(cost);
    f.resources.rules.effects.push({
      interactionId: ability.id,
      isTrigger: false,
      effectIndex: 0,
      poolId: "blue",
    });
    expect(
      reactionActions(f.game, f.state, special, 1, "attack", f.resources),
    ).toHaveLength(0);
    cost.amounts[0].amount = 3;
    expect(
      reactionActions(f.game, f.state, special, 1, "attack", f.resources),
    ).toHaveLength(1);
    const r = performReaction(
      f.game,
      f.state,
      special,
      1,
      0,
      "attack",
      input(ability.id, { sourceInstanceId: trap.id }),
      rng,
      f.resources,
    );
    expect(
      resourceValue(
        { rules: f.resources.rules, balances: r.resources! },
        1,
        "blue",
      ),
    ).toBe(2);
    expect(r.state.cards.find((c) => c.id === trap.id)!.zone).toBe("discard");
  });
  it("validates configuration and prunes deleted pool/card/effect references", () => {
    const f = fixture();
    expect(() =>
      validateResourceRules(f.game, f.resources.rules),
    ).not.toThrow();
    const invalid: ResourceRules = structuredClone(f.resources.rules);
    invalid.pools[1].name = "Red mana";
    expect(() => validateResourceRules(f.game, invalid)).toThrow("distinct");
    invalid.pools[1].name = "Blue mana";
    invalid.costs.push({ actionId: "missing", cardId: "", amounts: [] });
    expect(() => validateResourceRules(f.game, invalid)).toThrow("Unknown");
    f.doc.resources.costs.push({
      actionId: f.play.id,
      cardId: f.card.cardId,
      amounts: [{ poolId: "missing", amount: 5 }],
    });
    f.doc.resources.effects.push({
      interactionId: f.play.id,
      isTrigger: false,
      effectIndex: 100,
      poolId: "red",
    });
    const normalized = syncDocument(f.doc);
    expect(normalized.resources.costs[0].amounts).toEqual([]);
    expect(normalized.resources.effects).toEqual([]);
  });
});
