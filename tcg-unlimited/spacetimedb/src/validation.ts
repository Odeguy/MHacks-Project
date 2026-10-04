import type { Condition, DeckEntry, Effect, GameDefinition } from "./contracts";

export class RuleError extends Error {}
export function requireRule(ok: unknown, message: string): asserts ok {
  if (!ok) throw new RuleError(message);
}
export function bounded(
  value: number,
  min: number,
  max: number,
  label: string,
) {
  requireRule(
    Number.isInteger(value) && value >= min && value <= max,
    `${label} must be an integer between ${min} and ${max}`,
  );
}
export function text(value: string, label: string, maximum = 120) {
  requireRule(
    value.trim().length > 0 && value.length <= maximum,
    `${label} must contain 1–${maximum} characters`,
  );
}
function ids(items: { id: string }[], label: string, maximum = 256) {
  requireRule(items.length <= maximum, `Too many ${label}`);
  const found = new Set<string>();
  for (const item of items) {
    requireRule(
      /^[a-zA-Z0-9_-]{1,64}$/.test(item.id),
      `Invalid ${label} ID: ${item.id}`,
    );
    requireRule(!found.has(item.id), `Duplicate ${label} ID: ${item.id}`);
    found.add(item.id);
  }
  return found;
}
function refs(values: string[], available: Set<string>, label: string) {
  requireRule(
    values.length <= 256 && new Set(values).size === values.length,
    `Duplicate or excessive ${label}`,
  );
  for (const value of values)
    requireRule(available.has(value), `Unknown ${label}: ${value}`);
}
export function emptyDefinition(): GameDefinition {
  return {
    formats: [],
    participants: { minimum: 2, maximum: 2 },
    field: { rows: 2, columns: 5, slots: [] },
    spaces: [
      { id: "hand", kind: "hand", visibility: "owner", capacity: 10 },
      { id: "deck", kind: "deck", visibility: "hidden", capacity: 200 },
      { id: "discard", kind: "discard", visibility: "public", capacity: 200 },
    ],
    cards: [],
    actions: [],
    triggers: [],
    constraints: [],
    dice: [],
    coins: [],
    hand: { initial: 5, maximum: 10 },
    phases: [],
    startingHealth: 20,
    victory: "health",
    deckRules: {
      minSize: 10,
      maxSize: 40,
      maxCopies: 4,
      copyLimits: [],
      allowedFormatIds: [],
    },
    starterDecks: [],
    setup: { startingResource: 3, turnResource: 1, turnDraw: 1 },
  };
}

export function validateDraftBounds(game: GameDefinition) {
  // Incomplete drafts are allowed, but cannot be used to bypass bounded storage/work.
  requireRule(
    JSON.stringify(game).length <= 250_000,
    "Game definition exceeds 250 KB",
  );
  ids(game.formats, "formats", 32);
  ids(game.cards, "cards", 256);
  ids(game.actions, "actions", 64);
  ids(game.triggers, "triggers", 64);
  ids(game.constraints, "constraints", 64);
  ids(game.phases, "phases", 16);
  ids(game.spaces, "spaces", 16);
  ids(game.dice, "dice", 16);
  ids(game.coins, "coins", 16);
  ids(game.starterDecks, "starter decks", 16);
  ids(game.field.slots, "slots", 144);
}

function validateConditions(
  conditions: Condition[],
  statKeys: Set<string>,
  randomIds: Set<string>,
) {
  requireRule(conditions.length <= 16, "At most 16 conditions per rule");
  for (const c of conditions) {
    requireRule(
      [
        "resource_at_least",
        "health_at_least",
        "hand_count_at_most",
        "field_count_at_most",
        "card_stat_at_least",
        "roll_at_least",
        "coin_is",
      ].includes(c.kind),
      `Unsupported condition: ${c.kind}`,
    );
    requireRule(
      ["actor", "target_player", "source_card", "target_card"].includes(
        c.target,
      ),
      "Invalid condition target",
    );
    bounded(c.value, 0, 1_000_000, "Condition value");
    if (c.kind === "card_stat_at_least") {
      requireRule(
        ["source_card", "target_card"].includes(c.target) &&
          statKeys.has(c.key),
        "Condition requires a numeric card field",
      );
    } else if (c.kind === "roll_at_least") {
      requireRule(randomIds.has(c.key), "Condition references unknown dice");
    } else if (c.kind === "coin_is") {
      text(c.key, "Coin outcome", 64);
    } else
      requireRule(
        ["actor", "target_player"].includes(c.target),
        "Condition requires a player target",
      );
  }
}
function validateEffects(
  effects: Effect[],
  game: GameDefinition,
  statKeys: Set<string>,
) {
  requireRule(effects.length <= 32, "At most 32 effects per interaction");
  const zones = new Set(["field", ...game.spaces.map((s) => s.id)]);
  for (const e of effects) {
    requireRule(
      [
        "draw",
        "damage",
        "heal",
        "gain_resource",
        "spend_resource",
        "move",
        "discard",
        "change_stat",
        "roll_dice",
        "flip_coin",
      ].includes(e.kind),
      `Unsupported effect: ${e.kind}`,
    );
    requireRule(
      ["actor", "target_player", "source_card", "target_card"].includes(
        e.target,
      ),
      "Invalid effect target",
    );
    bounded(
      e.amount,
      e.kind === "change_stat" ? -1_000_000 : 0,
      1_000_000,
      "Effect amount",
    );
    if (e.statKey)
      requireRule(
        statKeys.has(e.statKey),
        `Unknown numeric field: ${e.statKey}`,
      );
    if (e.defenseKey)
      requireRule(
        e.kind === "damage" && statKeys.has(e.defenseKey),
        "Invalid defense field",
      );
    if (e.kind === "move" || e.kind === "discard" || e.kind === "change_stat") {
      requireRule(
        ["source_card", "target_card"].includes(e.target),
        `${e.kind} requires a card target`,
      );
    }
    if (e.kind === "move")
      requireRule(zones.has(e.zone), `Unknown destination space: ${e.zone}`);
    if (e.kind === "change_stat")
      requireRule(Boolean(e.statKey), "Stat changes require a numeric field");
    if (["draw", "heal", "gain_resource", "spend_resource"].includes(e.kind)) {
      requireRule(
        ["actor", "target_player"].includes(e.target),
        `${e.kind} requires a player target`,
      );
    }
    if (e.kind === "roll_dice")
      requireRule(
        game.dice.some((d) => d.id === e.randomId),
        "Unknown dice",
      );
    if (e.kind === "flip_coin")
      requireRule(
        game.coins.some((c) => c.id === e.randomId),
        "Unknown coin",
      );
    if (e.randomId && !["roll_dice", "flip_coin"].includes(e.kind))
      requireRule(
        game.dice.some((d) => d.id === e.randomId),
        "Unknown dice modifier",
      );
    if (e.kind === "draw") bounded(e.amount, 0, 200, "Draw count");
    if (e.defenseKey)
      requireRule(
        ["source_card", "target_card"].includes(e.target),
        "Defense applies only to card damage",
      );
  }
}

function validateContext(
  conditions: Condition[],
  effects: Effect[],
  source: boolean,
  cardTarget: boolean,
  playerTarget: boolean,
  randomConditions: boolean,
) {
  for (const c of conditions) {
    requireRule(
      randomConditions || !["roll_at_least", "coin_is"].includes(c.kind),
      "Random conditions belong on event triggers after a roll/flip",
    );
    requireRule(
      c.target !== "source_card" || source,
      "Condition needs a source card",
    );
    requireRule(
      c.target !== "target_card" || cardTarget,
      "Condition needs a card target",
    );
    requireRule(
      c.target !== "target_player" || playerTarget,
      "Condition needs a player target",
    );
  }
  const rolled = new Set<string>();
  for (const e of effects) {
    requireRule(
      e.target !== "source_card" || source,
      "Effect needs a source card",
    );
    requireRule(
      e.target !== "target_card" || cardTarget,
      "Effect needs a card target",
    );
    requireRule(
      e.target !== "target_player" || playerTarget,
      "Effect needs a player target",
    );
    requireRule(
      !e.statKey || e.kind === "change_stat" || source,
      "Stat modifier needs a source card",
    );
    if (e.kind === "roll_dice") rolled.add(e.randomId);
    else if (e.kind !== "flip_coin" && e.randomId)
      requireRule(
        rolled.has(e.randomId),
        "Roll dice before using their value in an interaction",
      );
  }
}

export function validateGame(game: GameDefinition) {
  validateDraftBounds(game);
  bounded(game.participants.minimum, 2, 8, "Minimum participants");
  bounded(
    game.participants.maximum,
    game.participants.minimum,
    8,
    "Maximum participants",
  );
  bounded(game.field.rows, 1, 12, "Field rows");
  bounded(game.field.columns, 1, 12, "Field columns");
  bounded(game.startingHealth, 1, 1_000_000, "Starting health");
  requireRule(
    game.victory === "health",
    "Only health-based victory is supported",
  );
  bounded(game.hand.maximum, 1, 200, "Maximum hand size");
  bounded(game.hand.initial, 0, game.hand.maximum, "Initial hand size");
  bounded(game.setup.startingResource, 0, 1_000_000, "Starting resource");
  bounded(game.setup.turnResource, 0, 1_000_000, "Turn resource");
  bounded(game.setup.turnDraw, 0, 200, "Turn draw");
  const formats = new Set(game.formats.map((f) => f.id));
  const actions = new Set(game.actions.map((a) => a.id));
  const triggers = new Set(game.triggers.map((a) => a.id));
  requireRule(
    formats.size > 0 && game.cards.length > 0,
    "A game needs card formats and cards",
  );
  requireRule(
    game.actions.length > 0 && game.phases.length > 0,
    "A game needs actions and phases",
  );
  const numericFields = new Set<string>();
  for (const format of game.formats) {
    text(format.name, "Card format name");
    requireRule(
      format.fields.length <= 32,
      "At most 32 fields per card format",
    );
    const keys = new Set<string>();
    for (const f of format.fields) {
      requireRule(
        /^[a-zA-Z0-9_-]{1,64}$/.test(f.key) && !keys.has(f.key),
        "Invalid or duplicate card field",
      );
      keys.add(f.key);
      text(f.label, "Field label");
      requireRule(
        ["number", "text"].includes(f.kind),
        "Fields must be number or text",
      );
      if (f.kind === "number") numericFields.add(f.key);
    }
    refs(format.buttons, actions, "button action");
  }
  for (const s of game.spaces) {
    requireRule(!["field", "none"].includes(s.id), "Space ID is reserved");
    requireRule(
      ["hand", "deck", "discard", "reserve"].includes(s.kind),
      "Unknown space kind",
    );
    requireRule(
      ["owner", "hidden", "public"].includes(s.visibility),
      "Unknown space visibility",
    );
    bounded(s.capacity, 1, 200, "Space capacity");
    if (s.kind === "deck")
      requireRule(s.visibility === "hidden", "Deck order must remain hidden");
    if (s.kind === "hand")
      requireRule(s.visibility === "owner", "Hands must be owner-only");
  }
  for (const kind of ["hand", "deck", "discard"]) {
    requireRule(
      game.spaces.filter((s) => s.kind === kind).length === 1,
      `Exactly one ${kind} space is required`,
    );
  }
  requireRule(
    game.spaces.find((s) => s.kind === "hand")!.capacity >= game.hand.maximum,
    "Hand space is smaller than hand maximum",
  );
  const positions = new Set<string>();
  for (const slot of game.field.slots) {
    bounded(slot.row, 0, game.field.rows - 1, "Slot row");
    bounded(slot.column, 0, game.field.columns - 1, "Slot column");
    requireRule(
      ["player", "shared"].includes(slot.owner),
      "Slot owner must be player or shared",
    );
    const key = `${slot.row}:${slot.column}`;
    requireRule(!positions.has(key), "Two slots share field coordinates");
    positions.add(key);
    refs(slot.allowedFormatIds, formats, "slot format");
  }
  requireRule(game.field.slots.length > 0, "Designate at least one field slot");
  for (const card of game.cards) {
    text(card.name, "Card name");
    requireRule(formats.has(card.formatId), "Unknown card format");
    const fields = game.formats.find((f) => f.id === card.formatId)!.fields;
    requireRule(
      card.values.length === fields.length,
      "Card must supply every format field exactly once",
    );
    requireRule(
      new Set(card.values.map((v) => v.key)).size === card.values.length,
      "Duplicate card values",
    );
    for (const v of card.values) {
      const field = fields.find((f) => f.key === v.key);
      requireRule(field, "Unknown card field");
      if (field.kind === "number") {
        requireRule(
          v.numberValue !== undefined && v.textValue === undefined,
          "Numeric field needs only a number",
        );
        bounded(v.numberValue, 0, 1_000_000, "Card stat");
      } else
        requireRule(
          v.numberValue === undefined &&
            v.textValue !== undefined &&
            v.textValue.length <= 2000,
          "Text field needs only text",
        );
    }
    refs(card.actionIds, actions, "card action");
    refs(card.triggerIds, triggers, "card trigger");
  }
  for (const d of game.dice) {
    bounded(d.count, 1, 10, "Dice count");
    bounded(d.sides, 2, 1000, "Dice sides");
  }
  for (const c of game.coins) {
    requireRule(
      c.outcomes.length === 2 && c.outcomes[0] !== c.outcomes[1],
      "Coin needs two different outcomes",
    );
    c.outcomes.forEach((o) => text(o, "Coin outcome", 64));
  }
  const randomIds = new Set(game.dice.map((d) => d.id));
  requireRule(
    !game.coins.some((c) => randomIds.has(c.id)),
    "Dice and coin IDs must be distinct",
  );
  const zones = new Set(["none", "field", ...game.spaces.map((s) => s.id)]);
  for (const a of game.actions) {
    text(a.label, "Action label");
    bounded(a.resourceCost, 0, 1_000_000, "Resource cost");
    requireRule(
      ["play", "activate", "attack", "draw", "roll", "flip"].includes(a.kind),
      "Unknown action kind",
    );
    requireRule(zones.has(a.sourceZone), "Unknown source space");
    requireRule(
      [
        "none",
        "self",
        "opponent",
        "any_player",
        "own_card",
        "enemy_card",
        "any_card",
      ].includes(a.targetKind),
      "Unknown target kind",
    );
    if (a.kind === "play")
      requireRule(
        a.sourceZone === game.spaces.find((s) => s.kind === "hand")!.id,
        "Play must use the hand",
      );
    if (a.kind === "attack" || a.kind === "activate")
      requireRule(
        a.sourceZone === "field",
        "Attack/activate must use field cards",
      );
    if (["draw", "roll", "flip"].includes(a.kind))
      requireRule(
        a.sourceZone === "none",
        "Global actions cannot have a source card",
      );
    validateConditions(a.conditions, numericFields, randomIds);
    validateEffects(a.effects, game, numericFields);
    validateContext(
      a.conditions,
      a.effects,
      a.sourceZone !== "none",
      a.targetKind.endsWith("_card"),
      a.targetKind !== "none",
      false,
    );
  }
  for (const tr of game.triggers) {
    requireRule(
      [
        "played",
        "activated",
        "attacked",
        "damaged",
        "phase_started",
        "sub_phase_started",
        "turn_started",
      ].includes(tr.event),
      "Unknown trigger event",
    );
    validateConditions(tr.conditions, numericFields, randomIds);
    validateEffects(tr.effects, game, numericFields);
    // Trigger targets are intentionally local to the triggering card, never a guessed opponent.
    validateContext(
      tr.conditions,
      tr.effects,
      true,
      ["played", "activated", "attacked", "damaged"].includes(tr.event),
      false,
      true,
    );
    requireRule(
      !tr.effects.some((e) => e.kind === "move" && e.zone === "field"),
      "Triggers cannot choose a new field slot",
    );
    for (const c of tr.conditions)
      if (c.kind === "coin_is")
        requireRule(
          game.coins.some((coin) => coin.outcomes.includes(c.key)),
          "Unknown coin outcome",
        );
  }
  for (const c of game.constraints) {
    text(c.message, "Constraint message", 500);
    refs(c.actionIds, actions, "constraint action");
    validateConditions(c.conditions, numericFields, randomIds);
    for (const a of game.actions.filter(
      (a) => c.actionIds.length === 0 || c.actionIds.includes(a.id),
    ))
      validateContext(
        c.conditions,
        [],
        a.sourceZone !== "none",
        a.targetKind.endsWith("_card"),
        a.targetKind !== "none",
        false,
      );
  }
  for (const card of game.cards) {
    const format = game.formats.find((f) => f.id === card.formatId)!;
    const keys = new Set(
      format.fields.filter((f) => f.kind === "number").map((f) => f.key),
    );
    const interactions = game.actions.filter(
      (a) => card.actionIds.includes(a.id) || format.buttons.includes(a.id),
    );
    requireRule(
      interactions.every((a) => a.sourceZone !== "none"),
      "Card buttons must use a source card",
    );
    const rules = [
      ...interactions,
      ...game.triggers.filter((tr) => card.triggerIds.includes(tr.id)),
    ];
    for (const r of rules) {
      for (const e of r.effects)
        if (
          e.statKey &&
          (e.kind !== "change_stat" || e.target === "source_card")
        )
          requireRule(
            keys.has(e.statKey),
            `Card ${card.id} lacks source field ${e.statKey}`,
          );
      for (const c of r.conditions)
        if (c.kind === "card_stat_at_least" && c.target === "source_card")
          requireRule(
            keys.has(c.key),
            `Card ${card.id} lacks source field ${c.key}`,
          );
    }
  }
  for (const p of game.phases) {
    text(p.name, "Phase name");
    refs(p.allowedActionIds, actions, "phase action");
    ids(p.subPhases, "sub-phases", 16);
    for (const s of p.subPhases) {
      text(s.name, "Sub-phase name");
      refs(s.allowedActionIds, new Set(p.allowedActionIds), "sub-phase action");
    }
  }
  const r = game.deckRules;
  bounded(r.minSize, Math.max(1, game.hand.initial), 200, "Minimum deck size");
  bounded(r.maxSize, r.minSize, 200, "Maximum deck size");
  bounded(r.maxCopies, 1, 200, "Copy limit");
  requireRule(
    game.spaces.find((s) => s.kind === "deck")!.capacity >= r.maxSize,
    "Deck space is too small",
  );
  requireRule(
    game.spaces.find((s) => s.kind === "discard")!.capacity >= r.maxSize,
    "Discard space must hold a complete deck",
  );
  refs(r.allowedFormatIds, formats, "deck format");
  requireRule(
    new Set(r.copyLimits.map((c) => c.cardId)).size === r.copyLimits.length,
    "Duplicate copy limits",
  );
  for (const limit of r.copyLimits) {
    requireRule(
      game.cards.some((c) => c.id === limit.cardId),
      "Unknown card copy limit",
    );
    bounded(limit.maximum, 0, 200, "Copy limit");
  }
  for (const recipe of game.starterDecks) {
    text(recipe.name, "Starter deck name");
    validateDeck(game, recipe.entries, true);
  }
}

export function validateDeck(
  game: GameDefinition,
  entries: DeckEntry[],
  complete: boolean,
) {
  requireRule(
    entries.length <= 200 &&
      new Set(entries.map((e) => e.cardId)).size === entries.length,
    "Duplicate or excessive deck entries",
  );
  let count = 0;
  for (const e of entries) {
    const card = game.cards.find((c) => c.id === e.cardId);
    requireRule(card, `Unknown deck card: ${e.cardId}`);
    bounded(e.quantity, 1, 200, "Card quantity");
    const limit =
      game.deckRules.copyLimits.find((c) => c.cardId === e.cardId)?.maximum ??
      game.deckRules.maxCopies;
    requireRule(e.quantity <= limit, `Too many copies of ${card.name}`);
    requireRule(
      game.deckRules.allowedFormatIds.length === 0 ||
        game.deckRules.allowedFormatIds.includes(card.formatId),
      "Card format is not allowed in decks",
    );
    count += e.quantity;
  }
  requireRule(count <= game.deckRules.maxSize, "Deck exceeds maximum size");
  if (complete)
    requireRule(count >= game.deckRules.minSize, "Deck is incomplete");
  return count;
}
