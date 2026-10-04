import { describe, expect, it } from "vitest";
import { newDocument, syncDocument, resizeField, blankAbility, blankEffect, documentFromDefinition } from "../../src/designer-model";
import { validateDesignerRules, performDesignerAction, progressFor } from "../src/designer-rules";
import { validateGame } from "../src/validation";
import { initializeMatch, advancePhase } from "../src/engine";
import type { ActionInput, MatchState, RuleProgress } from "../src/contracts";
const rng = (_min: number, max: number) => max;
const input = (actionId: string, extra: Partial<ActionInput> = {}): ActionInput => ({ actionId, sourceInstanceId: undefined, targetInstanceId: undefined, targetSeat: undefined, slotId: undefined, ...extra });
function start(doc = newDocument()) {
  return initializeMatch(doc.definition, [0, 1].map((seat) => ({ seat, deckId: BigInt(seat + 1), revision: 1, entries: doc.definition.cards.map((card) => ({ cardId: card.id, quantity: 2 })) })), rng);
}
function act(doc: ReturnType<typeof newDocument>, state: MatchState, action: ActionInput, progress?: RuleProgress) {
  return performDesignerAction(doc.definition, state, state.activeSeat, state.revision, action, rng, doc.rules, progress);
}
describe("creation editor rules", () => {
  it("publishes the default template with separate fighter/effect slots and named health", () => {
    const doc = newDocument();
    expect(() => validateGame(doc.definition)).not.toThrow();
    expect(() => validateDesignerRules(doc.definition, doc.rules)).not.toThrow();
    expect(doc.rules.typeRoles.some((type) => type.role === "effect")).toBe(true);
    const resumed = documentFromDefinition(doc.name, doc.prompt, doc.definition, doc.rules);
    expect(resumed.rules).toEqual(doc.rules);
    expect(resumed.definition).toEqual(doc.definition);
  });
  it("enforces hand maximum and automatic draws per turn", () => {
    const doc = newDocument(); doc.definition.hand = { initial: 3, maximum: 4 }; doc.definition.setup.turnDraw = 3;
    let state = start(syncDocument(doc));
    for (let i = 0; i < doc.definition.phases.length; i++) state = advancePhase(doc.definition, state, 0, state.revision, rng).state;
    expect(state.activeSeat).toBe(1);
    expect(state.cards.filter((c) => c.ownerSeat === 1 && c.zone === "hand")).toHaveLength(4);
  });
  it("enforces the global play limit without changing state on a rejected action", () => {
    const doc = newDocument(); doc.rules.playsPerTurn = 1;
    const initial = start(doc), hand = initial.cards.filter((c) => c.ownerSeat === 0 && c.zone === "hand");
    const first = act(doc, initial, input("play", { sourceInstanceId: hand[0].id, slotId: "slot_0" }));
    const before = structuredClone(first);
    expect(() => act(doc, first.state, input("play", { sourceInstanceId: hand[1].id, slotId: "slot_1" }), first.progress)).toThrow("Plays per turn");
    expect(first).toEqual(before);
  });
  it("resets phase budgets while carrying the turn play count, and resets all budgets next turn", () => {
    const doc = newDocument(); doc.rules.phases[0].steps.find((s) => s.kind === "play")!.maximum = 1;
    doc.definition.phases.splice(1, 0, { id: "second_main", name: "Second main", allowedActionIds: ["play"], subPhases: [] });
    doc.rules.phases.push({ phaseId: "second_main", ordered: false, steps: [{ id: "second_play", kind: "play", formatId: "", maximum: 1 }] });
    const prepared = syncDocument(doc), initial = start(prepared), hand = initial.cards.filter((c) => c.ownerSeat === 0 && c.zone === "hand");
    const first = act(prepared, initial, input("play", { sourceInstanceId: hand[0].id, slotId: "slot_0" }));
    expect(() => act(prepared, first.state, input("play", { sourceInstanceId: hand[1].id, slotId: "slot_1" }), first.progress)).toThrow("Phase action limit");
    const advanced = advancePhase(prepared.definition, first.state, 0, first.state.revision, rng).state;
    const second = act(prepared, advanced, input("play", { sourceInstanceId: hand[1].id, slotId: "slot_1" }), first.progress);
    expect(second.progress.plays).toBe(2);
    expect(second.progress.counts).toEqual([{ stepId: "second_play", count: 1 }]);
    let state = second.state;
    while (state.activeSeat === 0) state = advancePhase(prepared.definition, state, 0, state.revision, rng).state;
    expect(progressFor(state, second.progress)).toMatchObject({ plays: 0, counts: [], lastStep: -1 });
  });
  it("allows skipping forward in ordered actions but rejects returning to an earlier action", () => {
    const doc = newDocument(); doc.rules.phases[0].ordered = true;
    doc.rules.phases[0].steps = [{ id: "play_first", kind: "play", formatId: "", maximum: 3 }, { id: "draw_second", kind: "draw", formatId: "", maximum: 1 }];
    const prepared = syncDocument(doc), first = act(prepared, start(prepared), input("draw"));
    const source = first.state.cards.find((c) => c.zone === "hand" && c.ownerSeat === 0)!;
    expect(() => act(prepared, first.state, input("play", { sourceInstanceId: source.id, slotId: "slot_0" }), first.progress)).toThrow("action order");
  });
  it("enforces per-card slot types even when another card of the same format fits", () => {
    let doc = newDocument();
    const explorer = doc.definition.cards[0];
    const other = doc.definition.cards.find((c) => c.id !== explorer.id && c.formatId === explorer.formatId)!;
    doc.rules.cardSlots.find((c) => c.cardId === other.id)!.allowedTypeIds.push("effect"); doc = syncDocument(doc);
    const initial = start(doc), source = initial.cards.find((c) => c.ownerSeat === 0 && c.zone === "hand" && c.cardId === explorer.id)!;
    expect(doc.definition.field.slots[3].allowedFormatIds).toContain(explorer.formatId);
    expect(() => act(doc, initial, input("play", { sourceInstanceId: source.id, slotId: "slot_3" }))).toThrow("slot type");
    expect(initial.cards.find((c) => c.id === source.id)?.zone).toBe("hand");
  });
  it("counts card and player attacks together", () => {
    const doc = newDocument(), initial = start(doc), source = initial.cards.find((c) => c.zone === "hand" && c.ownerSeat === 0)!;
    const played = act(doc, initial, input("play", { sourceInstanceId: source.id, slotId: "slot_0" }));
    const attackState = advancePhase(doc.definition, played.state, 0, played.state.revision, rng).state;
    const attacked = act(doc, attackState, input("attack_player", { sourceInstanceId: source.id, targetSeat: 1 }), played.progress);
    expect(() => act(doc, attacked.state, input("attack_card", { sourceInstanceId: source.id, targetInstanceId: 7 }), attacked.progress)).toThrow("Phase action limit");
  });
  it("gives different card types independent effect budgets and executes effect steps", () => {
    let doc = newDocument(); doc.definition.hand = { initial: 12, maximum: 12 };
    const fighter = doc.definition.cards[0], spell = doc.definition.cards.find((c) => doc.rules.typeRoles.find((t) => t.formatId === c.formatId)?.role === "effect")!;
    for (const card of [fighter, spell]) {
      const action = blankAbility(card.id); action.targetKind = "self"; action.oncePerTurn = false; action.effects = [{ ...blankEffect("heal"), amount: 2, target: "actor" }];
      card.actionIds.push(action.id); doc.definition.actions.push(action);
    }
    const main = doc.rules.phases[0]; main.steps = main.steps.filter((s) => s.kind !== "activate");
    main.steps.push({ id: "fighter_effect", kind: "activate", formatId: fighter.formatId, maximum: 1 }, { id: "spell_effect", kind: "activate", formatId: spell.formatId, maximum: 2 });
    doc = syncDocument(doc);
    const initial = start(doc); initial.players[0].health = 10;
    let result = { state: initial, progress: progressFor(initial) };
    const fighterInstance = result.state.cards.find((c) => c.ownerSeat === 0 && c.cardId === fighter.id)!, spellInstance = result.state.cards.find((c) => c.ownerSeat === 0 && c.cardId === spell.id)!;
    result = act(doc, result.state, input("play", { sourceInstanceId: fighterInstance.id, slotId: "slot_0" }), result.progress);
    result = act(doc, result.state, input("play", { sourceInstanceId: spellInstance.id, slotId: "slot_3" }), result.progress);
    result = act(doc, result.state, input(`ability_${fighter.id}`, { sourceInstanceId: fighterInstance.id }), result.progress);
    expect(() => act(doc, result.state, input(`ability_${fighter.id}`, { sourceInstanceId: fighterInstance.id }), result.progress)).toThrow("Phase action limit");
    for (let i = 0; i < 2; i++) result = act(doc, result.state, input(`ability_${spell.id}`, { sourceInstanceId: spellInstance.id }), result.progress);
    expect(result.state.players[0].health).toBe(16);
    expect(() => act(doc, result.state, input(`ability_${spell.id}`, { sourceInstanceId: spellInstance.id }), result.progress)).toThrow("Phase action limit");
  });
  it("keeps coordinates/types on resize and rejects unusable card/deck configurations", () => {
    const doc = newDocument(), resized = syncDocument(resizeField(doc, 3, 4));
    expect(resized.definition.field.slots).toHaveLength(12);
    expect(resized.rules.slots.find((s) => s.slotId === "slot_3")?.typeId).toBe("effect");
    expect(() => validateDesignerRules(resized.definition, resized.rules)).not.toThrow();
    doc.rules.cardSlots[0].allowedTypeIds = [];
    expect(() => validateDesignerRules(doc.definition, doc.rules)).toThrow("slot permissions");
    const limited = newDocument(); limited.definition.deckRules.copyLimits = limited.definition.cards.map((c) => ({ cardId: c.id, maximum: 1 }));
    expect(() => validateDesignerRules(limited.definition, limited.rules)).toThrow("minimum deck size");
  });
});
