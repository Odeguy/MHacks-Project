import type {
  DesignerRules,
  GameDefinition,
  MatchState,
  RuleProgress,
  ActionInput,
  SpecialRules,
} from "./contracts";
import { bounded, requireRule, text } from "./validation";
import { performAction, type RandomInt } from "./engine";
import { cardFormats } from "./card-formats";
import { fieldAdjustment, clampLimit } from "./field-effects";

const kinds = ["play", "activate", "attack", "draw", "roll", "flip"];
function unique(items: { id: string }[], label: string, maximum: number) {
  requireRule(
    items.length <= maximum &&
      new Set(items.map((item) => item.id)).size === items.length,
    `Duplicate or excessive ${label}`,
  );
  for (const item of items)
    requireRule(/^[a-zA-Z0-9_-]{1,64}$/.test(item.id), `Invalid ${label} ID`);
}
export function validateDesignerRules(
  game: GameDefinition,
  rules: DesignerRules,
) {
  text(rules.healthName, "Health name", 32);
  bounded(rules.playsPerTurn, 0, 200, "Plays per turn");
  unique(rules.slotTypes, "slot types", 32);
  requireRule(rules.slotTypes.length > 0, "Create a slot type");
  rules.slotTypes.forEach((type) => text(type.name, "Slot type name", 64));
  const types = new Set(rules.slotTypes.map((type) => type.id));
  const formats = new Set(game.formats.map((format) => format.id));
  requireRule(
    rules.typeRoles.length === formats.size &&
      new Set(rules.typeRoles.map((type) => type.formatId)).size ===
        formats.size,
    "Designate every card type once",
  );
  for (const type of rules.typeRoles)
    requireRule(
      formats.has(type.formatId) &&
        (["fighter", "effect"].includes(type.role) ||
          cardFormats.some((format) => format.id === type.role)),
      "Invalid card type format",
    );
  requireRule(
    rules.slots.length === game.field.slots.length &&
      new Set(rules.slots.map((slot) => slot.slotId)).size ===
        rules.slots.length,
    "Designate every field slot once",
  );
  for (const slot of rules.slots)
    requireRule(
      types.has(slot.typeId) &&
        game.field.slots.some((s) => s.id === slot.slotId),
      "Invalid slot designation",
    );
  requireRule(
    rules.cardSlots.length === game.cards.length &&
      new Set(rules.cardSlots.map((card) => card.cardId)).size ===
        game.cards.length,
    "Set slot permissions for every card",
  );
  for (const card of rules.cardSlots) {
    const definition = game.cards.find((item) => item.id === card.cardId);
    requireRule(
      definition &&
        card.allowedTypeIds.length > 0 &&
        card.allowedTypeIds.length <= 32 &&
        new Set(card.allowedTypeIds).size === card.allowedTypeIds.length &&
        card.allowedTypeIds.every((id) => types.has(id)),
      "Invalid card slot permissions",
    );
    requireRule(
      rules.slots.some(
        (slot) =>
          card.allowedTypeIds.includes(slot.typeId) &&
          game.field.slots.some(
            (s) =>
              s.id === slot.slotId &&
              (s.allowedFormatIds.length === 0 ||
                s.allowedFormatIds.includes(definition.formatId)),
          ),
      ),
      `No allowed field slot for ${definition.name}`,
    );
  }
  const possibleDeckSize = game.cards
    .filter(
      (card) =>
        game.deckRules.allowedFormatIds.length === 0 ||
        game.deckRules.allowedFormatIds.includes(card.formatId),
    )
    .reduce(
      (sum, card) =>
        sum +
        (game.deckRules.copyLimits.find((limit) => limit.cardId === card.id)
          ?.maximum ?? game.deckRules.maxCopies),
      0,
    );
  requireRule(
    possibleDeckSize >= game.deckRules.minSize,
    "Card copy limits cannot fill the minimum deck size",
  );
  requireRule(
    rules.phases.length === game.phases.length &&
      new Set(rules.phases.map((phase) => phase.phaseId)).size ===
        game.phases.length,
    "Set action rules for every phase",
  );
  for (const phase of rules.phases) {
    const definition = game.phases.find((p) => p.id === phase.phaseId);
    requireRule(definition, "Unknown phase");
    unique(phase.steps, "phase steps", 32);
    const selections = new Set<string>();
    for (const step of phase.steps) {
      bounded(step.maximum, 0, 200, "Action limit");
      requireRule(
        kinds.includes(step.kind) &&
          (!step.formatId || formats.has(step.formatId)),
        "Unknown phase action/type",
      );
      requireRule(
        !step.formatId || ["play", "activate", "attack"].includes(step.kind),
        "Global actions cannot select a card type",
      );
      const key = `${step.kind}:${step.formatId}`;
      requireRule(!selections.has(key), "Duplicate action/type in a phase");
      selections.add(key);
    }
  }
}
export function progressFor(
  state: MatchState,
  prior?: RuleProgress,
): RuleProgress {
  const sameTurn = prior?.turn === state.turn;
  const samePhase = sameTurn && prior?.phaseIndex === state.phaseIndex;
  return {
    turn: state.turn,
    phaseIndex: state.phaseIndex,
    plays: sameTurn ? prior!.plays : 0,
    counts: samePhase ? prior!.counts.map((item) => ({ ...item })) : [],
    lastStep: samePhase ? prior!.lastStep : -1,
  };
}
export function performDesignerAction(
  game: GameDefinition,
  state: MatchState,
  seat: number,
  revision: number,
  input: ActionInput,
  random: RandomInt,
  rules: DesignerRules,
  prior?: RuleProgress,
  special?: SpecialRules,
  resources?: import("./resources").ResourceContext,
) {
  const progress = progressFor(state, prior);
  const action = game.actions.find((item) => item.id === input.actionId);
  requireRule(action, "Unknown action");
  const card = game.cards.find(
    (item) =>
      item.id ===
      state.cards.find((c) => c.id === input.sourceInstanceId)?.cardId,
  );
  requireRule(
    action.kind !== "activate" ||
      !special?.reactions.some((r) => r.cardId === card?.id),
    "Trap effects require a reaction window",
  );
  const phase = rules.phases.find(
    (item) => item.phaseId === game.phases[state.phaseIndex].id,
  )!;
  // A type-specific rule overrides the all-types rule, allowing separate fighter/effect budgets.
  let index = phase.steps.findIndex(
    (step) =>
      step.kind === action.kind &&
      !!step.formatId &&
      step.formatId === card?.formatId,
  );
  if (index < 0)
    index = phase.steps.findIndex(
      (step) => step.kind === action.kind && !step.formatId,
    );
  const step = phase.steps[index];
  requireRule(step, "Action/type is not allowed in this phase");
  const used =
    progress.counts.find((item) => item.stepId === step.id)?.count ?? 0;
  const maximum = clampLimit(
    step.maximum +
      (action.kind === "attack"
        ? fieldAdjustment(state, special, "attacks", seat)
        : action.kind === "play"
          ? fieldAdjustment(state, special, "plays", seat)
          : action.kind === "draw"
            ? fieldAdjustment(state, special, "turn_draw", seat)
            : 0),
  );
  requireRule(used < maximum, "Phase action limit reached");
  requireRule(
    !phase.ordered || index >= progress.lastStep,
    "Follow the phase's action order",
  );
  const result = performAction(game, state, seat, revision, input, random, {
    special,
    resources,
  });
  validatePlacementPermissions(result.state, rules);
  progress.lastStep = index;
  if (action.kind === "play") progress.plays++;
  const count = progress.counts.find((item) => item.stepId === step.id);
  if (count) count.count++;
  else progress.counts.push({ stepId: step.id, count: 1 });
  return { ...result, progress: progressFor(result.state, progress) };
}
export function validatePlacementPermissions(
  state: MatchState,
  rules: DesignerRules,
) {
  // Check placements caused by effects and triggers as well as normal plays.
  for (const instance of state.cards.filter((item) => item.zone === "field")) {
    const typeId = rules.slots.find(
      (slot) => slot.slotId === instance.slotId,
    )?.typeId;
    requireRule(
      typeId &&
        rules.cardSlots
          .find((c) => c.cardId === instance.cardId)
          ?.allowedTypeIds.includes(typeId),
      "Card is not allowed in this slot type",
    );
  }
}
