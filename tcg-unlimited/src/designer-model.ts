import { definitionFromSettings } from "./game-definitions";
import type {
  GameDefinition,
  DesignerRules,
  CardEffect,
  GameAction,
} from "./module_bindings/types";

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
      role: /effect|relic/i.test(format.name) ? "effect" : "fighter",
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
): DesignerDocument {
  const doc = structuredClone({
    name,
    prompt,
    definition,
    rules: rules ?? defaultRules(definition),
  }) as DesignerDocument;
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
      rules.typeRoles.find((role) => role.formatId === card.formatId)!.role,
    ],
  }));
  let doc = { name: "Untitled game", prompt: "", definition: game, rules };
  for (const type of rules.typeRoles)
    doc = changeTypeRole(doc, type.formatId, type.role);
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
export function changeTypeRole(
  document: DesignerDocument,
  formatId: string,
  role: string,
): DesignerDocument {
  const doc = structuredClone(document);
  const format = doc.definition.formats.find((item) => item.id === formatId)!;
  doc.rules.typeRoles.find((item) => item.formatId === formatId)!.role = role;
  format.fields = [
    ...(role === "fighter"
      ? [
          { key: "atk", label: "Attack", kind: "number" },
          { key: "def", label: "Defense", kind: "number" },
        ]
      : []),
    { key: "text", label: "Description", kind: "text" },
  ];
  format.buttons = doc.definition.actions
    .filter(
      (a) => a.kind === "play" || (role === "fighter" && a.kind === "attack"),
    )
    .map((a) => a.id);
  for (const card of doc.definition.cards.filter(
    (c) => c.formatId === formatId,
  ))
    card.values = format.fields.map(
      (field) =>
        card.values.find((v) => v.key === field.key) ?? {
          key: field.key,
          numberValue: field.kind === "number" ? 0 : undefined,
          textValue: field.kind === "text" ? "" : undefined,
        },
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
