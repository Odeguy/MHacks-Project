import { definitionFromSettings } from "./game-definitions";
import {
  cardFormat,
  normalizeCardFormat,
} from "../spacetimedb/src/card-formats";
import type {
  GameDefinition,
  DesignerRules,
  CardEffect,
  GameAction,
} from "./module_bindings/types";
import type { SpecialRules, ResourceRules } from "../spacetimedb/src/contracts";
import { legacyResourceRules } from "../spacetimedb/src/resources";

type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;
export type DesignerDocument = {
  name: string;
  prompt: string;
  definition: Mutable<GameDefinition>;
  rules: Mutable<DesignerRules>;
  special: Mutable<SpecialRules>;
  resources: Mutable<ResourceRules>;
};
export const actionKinds = [
  "play",
  "activate",
  "attack",
  "draw",
  "roll",
  "flip",
] as const;
export const actionNames: Record<string, string> = {
  play: "Play cards",
  activate: "Use effects",
  attack: "Attack",
  draw: "Draw cards",
  roll: "Roll dice",
  flip: "Flip coin",
};
export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}
export function defaultRules(game: GameDefinition): Mutable<DesignerRules> {
  return {
    healthName: "LP",
    playsPerTurn: 3,
    typeRoles: game.formats.map((format) => ({
      formatId: format.id,
      role: /effect|relic/i.test(format.name)
        ? "persistent_effect"
        : "basic_atk_def",
    })),
    slotTypes: [{ id: "general", name: "General" }],
    slots: game.field.slots.map((slot) => ({
      slotId: slot.id,
      typeId: "general",
    })),
    cardSlots: game.cards.map((card) => ({
      cardId: card.id,
      allowedTypeIds: ["general"],
    })),
    phases: game.phases.map((phase) => ({
      phaseId: phase.id,
      ordered: false,
      steps: actionKinds
        .filter((kind) =>
          game.actions.some(
            (action) =>
              action.kind === kind &&
              phase.allowedActionIds.includes(action.id),
          ),
        )
        .map((kind) => ({
          id: `${phase.id}_${kind}`,
          kind,
          formatId: "",
          maximum: kind === "play" ? 3 : 1,
        })),
    })),
  };
}
export function documentFromDefinition(
  name: string,
  prompt: string,
  definition: GameDefinition,
  rules?: DesignerRules,
  special?: SpecialRules,
  resources?: ResourceRules,
): DesignerDocument {
  const doc = structuredClone({
    name,
    prompt,
    definition,
    rules: rules ?? defaultRules(definition),
    special: special ?? { reactions: [], fields: [] },
    resources: resources ?? legacyResourceRules(definition),
  }) as DesignerDocument;
  for (const type of doc.rules.typeRoles) {
    const format = doc.definition.formats.find((f) => f.id === type.formatId);
    const actionIds = [
      ...(format?.buttons ?? []),
      ...doc.definition.cards
        .filter((c) => c.formatId === type.formatId)
        .flatMap((c) => c.actionIds),
    ];
    type.role = normalizeCardFormat(
      type.role,
      doc.definition.actions.some(
        (a) => a.kind === "activate" && actionIds.includes(a.id),
      ),
    );
    if (
      !rules &&
      type.role === "basic_atk_def" &&
      doc.definition.actions.some(
        (a) => a.kind === "activate" && actionIds.includes(a.id),
      )
    )
      type.role = "effect_atk_def";
  }
  // Give inherited format abilities independent card actions, preserving their effects on resume.
  for (const card of doc.definition.cards) {
    const format = doc.definition.formats.find((f) => f.id === card.formatId)!;
    for (const id of format.buttons) {
      const action = doc.definition.actions.find((a) => a.id === id);
      if (action?.kind !== "activate") continue;
      const clone = { ...action, id: `ability_${card.id}` };
      if (!doc.definition.actions.some((a) => a.id === clone.id))
        doc.definition.actions.push(clone);
      if (!card.actionIds.includes(clone.id)) card.actionIds.push(clone.id);
      for (const phase of doc.definition.phases) {
        if (phase.allowedActionIds.includes(id))
          phase.allowedActionIds.push(clone.id);
        for (const sub of phase.subPhases)
          if (sub.allowedActionIds.includes(id))
            sub.allowedActionIds.push(clone.id);
      }
    }
  }
  for (const format of doc.definition.formats)
    format.buttons = format.buttons.filter(
      (id) =>
        doc.definition.actions.find((a) => a.id === id)?.kind !== "activate",
    );
  return doc;
}
export function newDocument(): DesignerDocument {
  const doc = exampleDocument();
  doc.definition.cards = [];
  doc.definition.triggers = [];
  doc.definition.deckRules.copyLimits = [];
  doc.rules.cardSlots = [];
  doc.resources = { enabled: false, pools: [{ id: "resource", name: "Mana", starting: 3, perTurn: 1 }], costs: [], effects: [] };
  return syncDocument(doc);
}
export function exampleDocument(): DesignerDocument {
  const game = definitionFromSettings({
    name: "Untitled game",
    prompt: "",
    health: 20,
    hand: 3,
    players: 2,
    rows: 2,
    columns: 3,
    dice: true,
    coin: false,
    phases: "Main, Attack, End",
  }) as Mutable<GameDefinition>;
  game.starterDecks = [];
  game.actions = game.actions
    .filter((a) => a.id !== "heal")
    .map((a) => ({ ...a, resourceCost: 0, oncePerTurn: a.kind === "attack" }));
  game.phases = game.phases.map((phase) => ({ ...phase, subPhases: [] }));
  const rules = defaultRules(game);
  rules.slotTypes = [
    { id: "fighter", name: "Fighter" },
    { id: "effect", name: "Effect" },
  ];
  rules.slots = game.field.slots.map((slot) => ({
    slotId: slot.id,
    typeId: slot.row === 0 ? "fighter" : "effect",
  }));
  rules.cardSlots = game.cards.map((card) => ({
    cardId: card.id,
    allowedTypeIds: [
      cardFormat(
        rules.typeRoles.find((type) => type.formatId === card.formatId)!.role,
      ).combat
        ? "fighter"
        : "effect",
    ],
  }));
  let doc: DesignerDocument = {
    name: "Untitled game",
    prompt: "",
    definition: game,
    rules,
    special: { reactions: [], fields: [] },
    resources: legacyResourceRules(game),
  };
  for (const type of rules.typeRoles)
    doc = changeTypeFormat(doc, type.formatId, type.role);
  doc.rules.phases[0].steps.push({
    id: "main_activate",
    kind: "activate",
    formatId: "",
    maximum: 2,
  });
  return syncDocument(doc);
}
export function syncDocument(document: DesignerDocument): DesignerDocument {
  const doc = structuredClone(document);
  doc.special ??= { reactions: [], fields: [] };
  doc.resources ??= legacyResourceRules(doc.definition);
  const poolIds = new Set(doc.resources.pools.map(p => p.id));
  doc.resources.costs = doc.resources.costs.filter(c =>
    doc.definition.actions.some(a => a.id === c.actionId) &&
    (!c.cardId || doc.definition.cards.some(card => card.id === c.cardId))
  ).map(c => ({ ...c, amounts: c.amounts.filter(a => poolIds.has(a.poolId)) }));
  doc.resources.effects = doc.resources.effects.filter(b => {
    const effect = (b.isTrigger ? doc.definition.triggers : doc.definition.actions).find(a => a.id === b.interactionId)?.effects[b.effectIndex];
    return poolIds.has(b.poolId) && effect && ["gain_resource", "spend_resource"].includes(effect.kind);
  });
  const roleOf = (cardId: string) =>
    doc.rules.typeRoles.find(
      (type) =>
        type.formatId ===
        doc.definition.cards.find((c) => c.id === cardId)?.formatId,
    )?.role;
  doc.special.reactions = doc.special.reactions.filter(
    (rule) => roleOf(rule.cardId) === "trap_reaction",
  );
  doc.special.fields = doc.special.fields.filter(
    (rule) => roleOf(rule.cardId) === "field_effect",
  );
  for (const card of doc.definition.cards) {
    if (
      roleOf(card.id) === "trap_reaction" &&
      !doc.special.reactions.some((r) => r.cardId === card.id)
    )
      doc.special.reactions.push({
        cardId: card.id,
        onActions: ["play", "attack", "activate"],
        discardAfterUse: true,
      });
    if (
      roleOf(card.id) === "field_effect" &&
      !doc.special.fields.some((r) => r.cardId === card.id)
    )
      doc.special.fields.push({
        cardId: card.id,
        modifiers: [{ kind: "atk", scope: "all", amount: 1, formatId: "" }],
      });
  }
  for (const [kind, enabled, randomId] of [
    ["roll", doc.definition.dice.length > 0, doc.definition.dice[0]?.id],
    ["flip", doc.definition.coins.length > 0, doc.definition.coins[0]?.id],
  ] as const) {
    if (!enabled) {
      doc.definition.actions = doc.definition.actions.filter(
        (a) => a.kind !== kind,
      );
      for (const phase of doc.rules.phases)
        phase.steps = phase.steps.filter((step) => step.kind !== kind);
    } else if (!doc.definition.actions.some((a) => a.kind === kind)) {
      doc.definition.actions.push({
        id: kind,
        label: kind,
        kind,
        sourceZone: "none",
        targetKind: "none",
        resourceCost: 0,
        oncePerTurn: false,
        conditions: [],
        effects: [
          {
            ...blankEffect(kind === "roll" ? "roll_dice" : "flip_coin"),
            target: "actor",
            amount: 0,
            randomId: randomId!,
          },
        ],
      });
    }
  }
  for (const phase of doc.definition.phases) {
    const steps =
      doc.rules.phases.find((p) => p.phaseId === phase.id)?.steps ?? [];
    phase.allowedActionIds = doc.definition.actions
      .filter((a) => steps.some((s) => s.kind === a.kind))
      .map((a) => a.id);
    for (const sub of phase.subPhases)
      sub.allowedActionIds = sub.allowedActionIds.filter((id) =>
        phase.allowedActionIds.includes(id),
      );
  }
  const capacity = doc.definition.constraints.find(
    (rule) => rule.id === "space_for_unit",
  );
  if (capacity)
    capacity.conditions[0].value = doc.definition.field.slots.length - 1;
  for (const slot of doc.definition.field.slots) {
    const type = doc.rules.slots.find(
      (item) => item.slotId === slot.id,
    )?.typeId;
    slot.allowedFormatIds = [
      ...new Set(
        doc.definition.cards
          .filter(
            (card) =>
              type &&
              doc.rules.cardSlots
                .find((item) => item.cardId === card.id)
                ?.allowedTypeIds.includes(type),
          )
          .map((card) => card.formatId),
      ),
    ];
  }
  doc.definition.spaces = doc.definition.spaces.map((space) => ({
    ...space,
    capacity:
      space.kind === "hand"
        ? doc.definition.hand.maximum
        : ["deck", "discard"].includes(space.kind)
          ? doc.definition.deckRules.maxSize
          : space.capacity,
  }));
  return doc;
}
export function changeTypeFormat(
  document: DesignerDocument,
  formatId: string,
  presetId: string,
): DesignerDocument {
  const doc = structuredClone(document);
  const format = doc.definition.formats.find((item) => item.id === formatId)!;
  const preset = cardFormat(presetId);
  doc.rules.typeRoles.find((item) => item.formatId === formatId)!.role =
    preset.id;
  format.fields = [
    ...(preset.combat
      ? [
          { key: "atk", label: "Attack", kind: "number" },
          { key: "def", label: "Defense", kind: "number" },
        ]
      : []),
    { key: "text", label: "Description", kind: "text" },
  ];
  format.buttons = doc.definition.actions
    .filter((a) => a.kind === "play" || (preset.combat && a.kind === "attack"))
    .map((a) => a.id);
  for (const card of doc.definition.cards.filter(
    (c) => c.formatId === formatId,
  )) {
    if (!preset.effects)
      card.actionIds = card.actionIds.filter(
        (id) =>
          doc.definition.actions.find((a) => a.id === id)?.kind !== "activate",
      );
    card.values = format.fields.map(
      (field) =>
        card.values.find((v) => v.key === field.key) ?? {
          key: field.key,
          numberValue: field.kind === "number" ? 0 : undefined,
          textValue: field.kind === "text" ? "" : undefined,
        },
    );
  }
  doc.definition.actions = doc.definition.actions.filter(
    (action) =>
      action.kind !== "activate" ||
      doc.definition.cards.some((c) => c.actionIds.includes(action.id)) ||
      doc.definition.formats.some((f) => f.buttons.includes(action.id)),
  );
  return doc;
}
export function blankEffect(kind = "damage"): CardEffect {
  return {
    kind,
    target: kind === "damage" ? "target_player" : "actor",
    amount: 1,
    statKey: "",
    defenseKey: "",
    zone: "",
    randomId: "",
  };
}
export function blankAbility(cardId: string): Mutable<GameAction> {
  return {
    id: `ability_${cardId}`,
    label: "Use effect",
    kind: "activate",
    sourceZone: "field",
    targetKind: "opponent",
    resourceCost: 0,
    oncePerTurn: true,
    conditions: [],
    effects: [blankEffect()],
  };
}
export function resizeField(
  document: DesignerDocument,
  rows: number,
  columns: number,
): DesignerDocument {
  const doc = structuredClone(document);
  doc.definition.field = {
    rows,
    columns,
    slots: Array.from({ length: rows * columns }, (_, i) => {
      const row = Math.floor(i / columns),
        column = i % columns;
      return (
        doc.definition.field.slots.find(
          (slot) => slot.row === row && slot.column === column,
        ) ?? {
          id: newId("slot"),
          row,
          column,
          owner: "player",
          allowedFormatIds: [],
        }
      );
    }),
  };
  doc.rules.slots = doc.definition.field.slots.map(
    (slot) =>
      doc.rules.slots.find((s) => s.slotId === slot.id) ?? {
        slotId: slot.id,
        typeId: doc.rules.slotTypes[0].id,
      },
  );
  return doc;
}
