import { describe, expect, it } from "vitest";
import {
  exampleDocument as newDocument,
  changeTypeFormat,
  syncDocument,
  blankAbility,
  blankEffect,
} from "../../src/designer-model";
import { initializeMatch, performAction, advancePhase } from "../src/engine";
import { effectiveCardValues, fieldAdjustment } from "../src/field-effects";
import { performDesignerAction, progressFor } from "../src/designer-rules";
import {
  reactionActions,
  reactionSeats,
  performReaction,
} from "../src/reactions";
import { validateSpecialRules } from "../src/special-rules";
import type { ActionInput, MatchState } from "../src/contracts";
const rng = (_min: number, max: number) => max;
const input = (
  actionId: string,
  extra: Partial<ActionInput> = {},
): ActionInput => ({
  actionId,
  sourceInstanceId: undefined,
  targetSeat: undefined,
  targetInstanceId: undefined,
  slotId: undefined,
  ...extra,
});
function document() {
  let doc = newDocument();
  doc = changeTypeFormat(doc, "relic", "field_effect");
  doc = changeTypeFormat(doc, "effect", "trap_reaction");
  // The default template uses these format IDs; locate the cards after conversion.
  const trap = doc.definition.cards.find((c) => c.formatId === "effect")!;
  const ability = blankAbility(trap.id);
  ability.targetKind = "self";
  ability.effects = [{ ...blankEffect("heal"), amount: 3, target: "actor" }];
  trap.actionIds.push(ability.id);
  doc.definition.actions.push(ability);
  doc.definition.hand = { initial: 12, maximum: 12 };
  doc.rules.playsPerTurn = 200;
  doc.rules.phases[0].steps.find((s) => s.kind === "play")!.maximum = 200;
  return syncDocument(doc);
}
function start(doc = document(), seats = [0, 1]) {
  return initializeMatch(
    doc.definition,
    seats.map((seat) => ({
      seat,
      deckId: BigInt(seat + 1),
      revision: 1,
      entries: doc.definition.cards.map((card) => ({
        cardId: card.id,
        quantity: 2,
      })),
    })),
    rng,
  );
}
function placed(
  doc: ReturnType<typeof document>,
  state: MatchState,
  seat: number,
  preset: string,
  slotId = "slot_3",
) {
  const formatId = doc.rules.typeRoles.find((t) => t.role === preset)!.formatId;
  const card = state.cards.find(
    (c) =>
      c.ownerSeat === seat &&
      doc.definition.cards.find((d) => d.id === c.cardId)!.formatId ===
        formatId,
  )!;
  card.zone = "field";
  card.slotId = slotId;
  return card;
}
describe("reaction timing and field rules", () => {
  it("validates executable Trap and Field rules and rejects invalid configurations", () => {
    const doc = document();
    expect(() =>
      validateSpecialRules(doc.definition, doc.rules, doc.special),
    ).not.toThrow();
    const invalid = structuredClone(doc.special);
    invalid.reactions[0].onActions = [];
    expect(() =>
      validateSpecialRules(doc.definition, doc.rules, invalid),
    ).toThrow("reaction events");
    invalid.reactions[0].onActions = ["play"];
    invalid.fields[0].modifiers[0].amount = 201;
    expect(() =>
      validateSpecialRules(doc.definition, doc.rules, invalid),
    ).toThrow("Field modifier");
    doc.definition.cards.find(
      (c) => c.id === doc.special.reactions[0].cardId,
    )!.actionIds = [];
    expect(() =>
      validateSpecialRules(doc.definition, doc.rules, doc.special),
    ).toThrow("reaction effect");
  });
  it("stacks field bonuses with scopes and type filters without modifying base stats, and removes them on exit/elimination", () => {
    const doc = document(),
      state = start(doc);
    doc.special.fields[0].modifiers = [
      { kind: "atk", scope: "all", amount: 2, formatId: "" },
      { kind: "def", scope: "owner", amount: 3, formatId: "explorer" },
    ];
    const ownField = placed(doc, state, 0, "field_effect");
    const fighter = state.cards.find(
      (c) => c.ownerSeat === 0 && c.cardId === doc.definition.cards[0].id,
    )!;
    const enemy = state.cards.find(
      (c) => c.ownerSeat === 1 && c.cardId === fighter.cardId,
    )!;
    const stat = (card: typeof fighter, key: string) =>
      effectiveCardValues(doc.definition, state, card, doc.special).find(
        (v) => v.key === key,
      )!.numberValue;
    expect(stat(fighter, "atk")).toBe(5);
    expect(stat(fighter, "def")).toBe(5);
    expect(stat(enemy, "def")).toBe(2);
    placed(doc, state, 1, "field_effect");
    expect(stat(fighter, "atk")).toBe(7);
    expect(stat(enemy, "def")).toBe(5);
    state.players[1].eliminated = true;
    expect(stat(fighter, "atk")).toBe(5);
    ownField.zone = "discard";
    expect(stat(fighter, "atk")).toBe(3);
    expect(fighter.values.find((v) => v.key === "atk")!.numberValue).toBe(3);
  });
  it("applies field rules to phase plays, attacks, and costs, restoring limits when the Field leaves", () => {
    const doc = document(),
      state = start(doc);
    doc.rules.playsPerTurn = 0;
    doc.rules.phases[0].steps.find(s => s.kind === "play")!.maximum = 0;
    doc.special.fields[0].modifiers = [
      { kind: "plays", scope: "owner", amount: 1, formatId: "" },
      { kind: "attacks", scope: "owner", amount: 1, formatId: "" },
      { kind: "action_cost", scope: "opponents", amount: 2, formatId: "" },
    ];
    const field = placed(doc, state, 0, "field_effect"),
      fighter = state.cards.find(
        (c) => c.ownerSeat === 0 && c.cardId === doc.definition.cards[0].id,
      )!;
    const played = performDesignerAction(
      doc.definition,
      state,
      0,
      state.revision,
      input("play", { sourceInstanceId: fighter.id, slotId: "slot_0" }),
      rng,
      doc.rules,
      undefined,
      doc.special,
    );
    expect(played.progress.plays).toBe(1);
    const secondFighter = played.state.cards.find(
      (c) => c.ownerSeat === 0 && c.cardId === doc.definition.cards[1].id,
    )!;
    secondFighter.zone = "field";
    secondFighter.slotId = "slot_1";
    const phase = advancePhase(
      doc.definition,
      played.state,
      0,
      played.state.revision,
      rng,
      doc.special,
    ).state;
    const first = performDesignerAction(
      doc.definition,
      phase,
      0,
      phase.revision,
      input("attack_player", { sourceInstanceId: fighter.id, targetSeat: 1 }),
      rng,
      doc.rules,
      played.progress,
      doc.special,
    );
    const second = performDesignerAction(
      doc.definition,
      first.state,
      0,
      first.state.revision,
      input("attack_player", {
        sourceInstanceId: secondFighter.id,
        targetSeat: 1,
      }),
      rng,
      doc.rules,
      first.progress,
      doc.special,
    );
    expect(second.progress.counts[0].count).toBe(2);
    const reset = structuredClone(state);
    reset.cards.find((c) => c.id === field.id)!.zone = "discard";
    expect(() =>
      performDesignerAction(
        doc.definition,
        reset,
        0,
        reset.revision,
        input("play", { sourceInstanceId: fighter.id, slotId: "slot_0" }),
        rng,
        doc.rules,
        undefined,
        doc.special,
      ),
    ).toThrow("Phase action limit");
    expect(fieldAdjustment(state, doc.special, "action_cost", 1)).toBe(2);
    expect(fieldAdjustment(state, doc.special, "action_cost", 0)).toBe(0);
  });
  it("honors dynamic hand maximum and phase draw bonuses without automatic turn draws", () => {
    const doc = document();
    doc.definition.hand = { initial: 3, maximum: 3 };
    doc.special.fields[0].modifiers = [
      { kind: "max_hand", scope: "all", amount: 2, formatId: "" },
      { kind: "turn_draw", scope: "all", amount: 2, formatId: "" },
    ];
    const state = start(doc),
      field = placed(doc, state, 0, "field_effect");
    let next = performAction(
      doc.definition,
      state,
      0,
      state.revision,
      input("draw"),
      rng,
      { special: doc.special },
    ).state;
    expect(
      next.cards.filter((c) => c.ownerSeat === 0 && c.zone === "hand"),
    ).toHaveLength(4);
    next.cards.find((c) => c.id === field.id)!.zone = "discard";
    next = performAction(
      doc.definition,
      next,
      0,
      next.revision,
      input("draw"),
      rng,
      { special: doc.special },
    ).state;
    expect(
      next.cards.filter((c) => c.ownerSeat === 0 && c.zone === "hand"),
    ).toHaveLength(4);
    const turn = start(doc);
    placed(doc, turn, 0, "field_effect");
    let advanced = turn;
    for (let i = 0; i < doc.definition.phases.length; i++)
      advanced = advancePhase(
        doc.definition,
        advanced,
        0,
        advanced.revision,
        rng,
        doc.special,
      ).state;
    expect(advanced.activeSeat).toBe(1);
    expect(
      advanced.cards.filter((c) => c.ownerSeat === 1 && c.zone === "hand"),
    ).toHaveLength(3);
    doc.rules.phases[0].steps.find(s => s.kind === "draw")!.maximum = 0;
    const first = performDesignerAction(doc.definition, advanced, 1, advanced.revision, input("draw"), rng, doc.rules, undefined, doc.special);
    const second = performDesignerAction(doc.definition, first.state, 1, first.state.revision, input("draw"), rng, doc.rules, first.progress, doc.special);
    expect(second.state.cards.filter(c => c.ownerSeat === 1 && c.zone === "hand")).toHaveLength(5);
    expect(() => performDesignerAction(doc.definition, second.state, 1, second.state.revision, input("draw"), rng, doc.rules, second.progress, doc.special)).toThrow("Phase action limit");
  });
  it("lets attacks destroy a statless Field card and removes its aura", () => {
    const doc = document(),
      state = start(doc),
      field = placed(doc, state, 1, "field_effect");
    const fighter = state.cards.find(
      (c) => c.ownerSeat === 0 && c.cardId === doc.definition.cards[0].id,
    )!;
    fighter.zone = "field";
    fighter.slotId = "slot_0";
    state.phaseIndex = 1;
    const result = performAction(
      doc.definition,
      state,
      0,
      state.revision,
      input("attack_card", {
        sourceInstanceId: fighter.id,
        targetInstanceId: field.id,
      }),
      rng,
      { special: doc.special },
    );
    expect(result.state.cards.find((c) => c.id === field.id)!.zone).toBe(
      "discard",
    );
    expect(fieldAdjustment(result.state, doc.special, "atk", 0)).toBe(0);
  });
  it("permits an eligible out-of-turn reaction, consumes its Trap, and preserves turn/budgets", () => {
    const doc = document(),
      state = start(doc),
      trap = placed(doc, state, 1, "trap_reaction");
    state.players[1].health = 10;
    expect(
      reactionSeats(doc.definition, state, doc.special, 0, "play"),
    ).toEqual([1]);
    expect(
      reactionSeats(doc.definition, state, doc.special, 0, "roll"),
    ).toEqual([]);
    const action = reactionActions(
      doc.definition,
      state,
      doc.special,
      1,
      "play",
    )[0].action;
    const before = progressFor(state);
    const result = performReaction(
      doc.definition,
      state,
      doc.special,
      1,
      state.revision,
      "play",
      input(action.id, { sourceInstanceId: trap.id }),
      rng,
    );
    expect(result.state.activeSeat).toBe(0);
    expect(result.state.players[1].health).toBe(13);
    expect(result.state.cards.find((c) => c.id === trap.id)!.zone).toBe(
      "discard",
    );
    expect(progressFor(result.state, before)).toEqual(before);
    expect(state.players[1].health).toBe(10);
  });
  it("orders multiplayer reactions clockwise, rejects wrong sources and ordinary Trap activations", () => {
    const doc = document();
    doc.definition.participants.maximum = 3;
    const state = start(doc, [0, 1, 2]);
    for (const seat of [0, 1, 2]) placed(doc, state, seat, "trap_reaction");
    expect(
      reactionSeats(doc.definition, state, doc.special, 1, "attack"),
    ).toEqual([2, 0]);
    const trap = reactionActions(
      doc.definition,
      state,
      doc.special,
      0,
      "play",
    )[0];
    expect(() =>
      performDesignerAction(
        doc.definition,
        state,
        0,
        state.revision,
        input(trap.action.id, { sourceInstanceId: trap.card.id }),
        rng,
        doc.rules,
        undefined,
        doc.special,
      ),
    ).toThrow("reaction window");
    expect(() =>
      performReaction(
        doc.definition,
        state,
        doc.special,
        1,
        state.revision,
        "play",
        input(trap.action.id, { sourceInstanceId: trap.card.id }),
        rng,
      ),
    ).toThrow("eligible");
    expect(() =>
      performReaction(
        doc.definition,
        state,
        doc.special,
        0,
        state.revision + 1,
        "play",
        input(trap.action.id, { sourceInstanceId: trap.card.id }),
        rng,
      ),
    ).toThrow("Match changed");
  });
});
