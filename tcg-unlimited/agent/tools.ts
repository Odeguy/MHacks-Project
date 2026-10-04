import type {
  GameDefinition,
  DesignerRules,
  SpecialRules,
  ResourceRules,
  Action,
  CardDefinition,
} from "../spacetimedb/src/contracts";
import {
  emptyDefinition,
  validateGame,
  validateDraftBounds,
  text,
  requireRule,
} from "../spacetimedb/src/validation";
import { validateDesignerRules } from "../spacetimedb/src/designer-rules";
import { validateSpecialRules } from "../spacetimedb/src/special-rules";
import { validateResourceRules } from "../spacetimedb/src/resources";
import { cardFormats, cardFormat } from "../spacetimedb/src/card-formats";
import { fieldModifierKinds } from "../spacetimedb/src/field-effects";
import {
  arr,
  assertSchema,
  bool,
  enumOf,
  id,
  int,
  obj,
  str,
  type Schema,
} from "./schema";

export type AgentDocument = {
  name: string;
  prompt: string;
  definition: GameDefinition;
  rules: DesignerRules;
  special: SpecialRules;
  resources: ResourceRules;
};
const actionKinds = enumOf(
  "play",
  "activate",
  "attack",
  "draw",
  "roll",
  "flip",
);
const targets = enumOf("actor", "target_player", "source_card", "target_card");
const conditionSchema = obj({
  kind: enumOf(
    "resource_at_least",
    "health_at_least",
    "hand_count_at_most",
    "field_count_at_most",
    "card_stat_at_least",
    "roll_at_least",
    "coin_is",
  ),
  target: targets,
  value: int(0, 1_000_000),
  key: str(64, 0),
});
const effectSchema = obj({
  kind: enumOf(
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
  ),
  target: targets,
  amount: int(-1_000_000, 1_000_000),
  statKey: str(64, 0),
  defenseKey: str(64, 0),
  zone: str(64, 0),
  randomId: str(64, 0),
});
const actionSchema = obj({
  id,
  label: str(),
  kind: actionKinds,
  sourceZone: str(64),
  targetKind: enumOf(
    "none",
    "self",
    "opponent",
    "any_player",
    "own_card",
    "enemy_card",
    "any_card",
  ),
  resourceCost: int(0, 1_000_000),
  oncePerTurn: bool,
  conditions: arr(conditionSchema, 16),
  effects: arr(effectSchema, 32),
});
const valuesSchema = arr(
  obj({ key: id, numberValue: int(0, 1_000_000), textValue: str(2000, 0) }, [
    "key",
  ]),
  32,
);
const cardSchema = obj({
  id,
  name: str(),
  formatId: id,
  values: valuesSchema,
  actionIds: arr(id, 64),
  triggerIds: arr(id, 64),
  allowedSlotTypeIds: arr(id, 32, 1),
  limitPerDeck: int(),
});
const entriesSchema = arr(obj({ cardId: id, quantity: int(1) }), 256, 1);
const stepSchema = obj({
  id,
  kind: actionKinds,
  formatId: str(64, 0),
  maximum: int(),
});

function upsert<T>(rows: T[], item: T, key: keyof T): void {
  const index = rows.findIndex((row) => row[key] === item[key]);
  if (index < 0) rows.push(item);
  else rows[index] = item;
}

export function blankDocument(): AgentDocument {
  const definition = emptyDefinition();
  definition.setup = { startingResource: 0, turnResource: 0, turnDraw: 0 };
  // Cards, formats, phases, slots and interactions are intentionally empty.
  return {
    name: "Untitled game",
    prompt: "",
    definition,
    rules: {
      healthName: "Health",
      playsPerTurn: 0,
      typeRoles: [],
      slotTypes: [],
      slots: [],
      cardSlots: [],
      phases: [],
    },
    special: { reactions: [], fields: [] },
    resources: {
      enabled: false,
      pools: [{ id: "resource", name: "Mana", starting: 0, perTurn: 0 }],
      costs: [],
      effects: [],
    },
  };
}

export function normalizeDocument(document: AgentDocument): AgentDocument {
  const doc = structuredClone(document),
    game = doc.definition;
  game.setup.turnDraw = 0;
  doc.rules.playsPerTurn = 0;
  for (const phase of game.phases) {
    const steps =
      doc.rules.phases.find((p) => p.phaseId === phase.id)?.steps ?? [];
    phase.allowedActionIds = game.actions
      .filter((a) => steps.some((s) => s.kind === a.kind))
      .map((a) => a.id);
  }
  for (const slot of game.field.slots) {
    const type = doc.rules.slots.find((s) => s.slotId === slot.id)?.typeId;
    slot.allowedFormatIds = [
      ...new Set(
        game.cards
          .filter((c) =>
            doc.rules.cardSlots
              .find((s) => s.cardId === c.id)
              ?.allowedTypeIds.includes(type ?? ""),
          )
          .map((c) => c.formatId),
      ),
    ];
  }
  for (const space of game.spaces) {
    if (space.kind === "hand") space.capacity = game.hand.maximum;
    if (["deck", "discard"].includes(space.kind))
      space.capacity = game.deckRules.maxSize;
  }
  return doc;
}

export function validateDocument(document: AgentDocument): AgentDocument {
  const doc = normalizeDocument(document);
  text(doc.name, "Game title", 80);
  requireRule(doc.prompt.length <= 2000, "Description exceeds 2000 characters");
  validateGame(doc.definition);
  validateDesignerRules(doc.definition, doc.rules);
  validateSpecialRules(doc.definition, doc.rules, doc.special);
  validateResourceRules(doc.definition, doc.resources);
  return doc;
}

type Tool = {
  name: string;
  description: string;
  parameters: Schema;
  apply: (doc: AgentDocument, args: unknown) => unknown;
};
function tool<T>(
  name: string,
  description: string,
  parameters: Schema,
  apply: (doc: AgentDocument, args: T) => unknown,
): Tool {
  return {
    name,
    description,
    parameters,
    apply: (doc, args) => {
      assertSchema(parameters, args);
      return apply(doc, args as T);
    },
  };
}

export const tools: Tool[] = [
  tool<{ name: string; description: string }>(
    "set_game_details",
    "Set the game title and concise description.",
    obj({ name: str(80), description: str(2000, 0) }),
    (d, a) => {
      d.name = a.name;
      d.prompt = a.description;
    },
  ),
  tool<{
    id: string;
    name: string;
    format: string;
    fields?: GameDefinition["formats"][number]["fields"];
    buttons: string[];
  }>(
    "create_card_format",
    "Create or replace a named card type and its format preset. Optional custom fields replace the preset fields. Buttons reference card-source actions, not global draws/rolls. Use per-card actionIds for abilities.",
    obj(
      {
        id,
        name: str(),
        format: enumOf(...cardFormats.map((f) => f.id)),
        fields: arr(
          obj({ key: id, label: str(), kind: enumOf("number", "text") }),
          32,
        ),
        buttons: arr(id, 64),
      },
      ["id", "name", "format", "buttons"],
    ),
    (d, a) => {
      const preset = cardFormat(a.format);
      upsert(
        d.definition.formats,
        {
          id: a.id,
          name: a.name,
          fields: a.fields ?? [
            ...(preset.combat
              ? [
                  { key: "atk", label: "Attack", kind: "number" },
                  { key: "def", label: "Defense", kind: "number" },
                ]
              : []),
            { key: "text", label: "Description", kind: "text" },
          ],
          buttons: a.buttons,
        },
        "id",
      );
      upsert(d.rules.typeRoles, { formatId: a.id, role: a.format }, "formatId");
    },
  ),
  tool<GameDefinition["participants"]>(
    "create_participant_limits",
    "Set minimum and maximum players (2–8).",
    obj({ minimum: int(2, 8), maximum: int(2, 8) }),
    (d, a) => {
      requireRule(a.maximum >= a.minimum, "Maximum players must cover minimum");
      d.definition.participants = a;
    },
  ),
  tool<Action>(
    "create_card_interaction",
    "Create or replace a playable action, attack, activated ability, draw, dice roll or coin flip. Play: hand/none, attack and activate: field, draw/roll/flip: none. All behavior must use these supported effects.",
    actionSchema,
    (d, a) => {
      upsert(d.definition.actions, a, "id");
    },
  ),
  tool<GameDefinition["triggers"][number]>(
    "create_trigger",
    "Create a triggered card effect. Attach its ID to card.triggerIds. Trigger effects can use actor/source_card, not guessed opponents.",
    obj({
      id,
      event: enumOf(
        "played",
        "activated",
        "attacked",
        "damaged",
        "phase_started",
        "sub_phase_started",
        "turn_started",
      ),
      conditions: arr(conditionSchema, 16),
      effects: arr(effectSchema, 32),
    }),
    (d, a) => {
      upsert(d.definition.triggers, a, "id");
    },
  ),
  tool<{
    cards: (CardDefinition & {
      allowedSlotTypeIds: string[];
      limitPerDeck: number;
    })[];
  }>(
    "create_cards",
    "Create or replace cards in batches. Supply every format field exactly once. Each value has numberValue OR textValue. Set effect action IDs, allowed slot types and per-deck copy limits.",
    obj({ cards: arr(cardSchema, 64, 1) }),
    (d, a) => {
      for (const { allowedSlotTypeIds, limitPerDeck, ...card } of a.cards) {
        upsert(d.definition.cards, card, "id");
        upsert(
          d.rules.cardSlots,
          { cardId: card.id, allowedTypeIds: allowedSlotTypeIds },
          "cardId",
        );
        upsert(
          d.definition.deckRules.copyLimits,
          { cardId: card.id, maximum: limitPerDeck },
          "cardId",
        );
      }
    },
  ),
  tool<{
    rows: number;
    columns: number;
    slotTypes: DesignerRules["slotTypes"];
    slots: { row: number; column: number; owner: string; typeId: string }[];
  }>(
    "create_field",
    "Create an n×m field and designate slots. Unspecified cells use the first slot type and player ownership. Player-owned fields are mirrored for each participant; shared slots are communal. Hands remain a separate private space.",
    obj({
      rows: int(1, 12),
      columns: int(1, 12),
      slotTypes: arr(obj({ id, name: str(64) }), 32, 1),
      slots: arr(
        obj({
          row: int(0, 11),
          column: int(0, 11),
          owner: enumOf("player", "shared"),
          typeId: id,
        }),
        144,
      ),
    }),
    (d, a) => {
      const seen = new Set<string>();
      for (const s of a.slots) {
        requireRule(
          s.row < a.rows &&
            s.column < a.columns &&
            a.slotTypes.some((t) => t.id === s.typeId),
          "Slot coordinates or type invalid",
        );
        const key = `${s.row}:${s.column}`;
        requireRule(!seen.has(key), "Duplicate slot coordinates");
        seen.add(key);
      }
      d.rules.slotTypes = a.slotTypes;
      d.definition.field = {
        rows: a.rows,
        columns: a.columns,
        slots: Array.from({ length: a.rows * a.columns }, (_, i) => {
          const row = Math.floor(i / a.columns),
            column = i % a.columns;
          return {
            id: `slot_${row}_${column}`,
            row,
            column,
            owner:
              a.slots.find((s) => s.row === row && s.column === column)
                ?.owner ?? "player",
            allowedFormatIds: [],
          };
        }),
      };
      d.rules.slots = d.definition.field.slots.map((s) => ({
        slotId: s.id,
        typeId:
          a.slots.find((c) => c.row === s.row && c.column === s.column)
            ?.typeId ?? a.slotTypes[0].id,
      }));
    },
  ),
  tool<{ constraints: GameDefinition["constraints"] }>(
    "create_constraints",
    "Create or replace constraints by ID. Conditions gate the specified actions; empty actionIds applies to all actions. Rules must be executable conditions, not prose alone.",
    obj({
      constraints: arr(
        obj({
          id,
          actionIds: arr(id, 64),
          conditions: arr(conditionSchema, 16),
          message: str(500),
        }),
        64,
      ),
    }),
    (d, a) => {
      for (const c of a.constraints) upsert(d.definition.constraints, c, "id");
    },
  ),
  tool<GameDefinition["dice"][number]>(
    "add_dice",
    "Add or replace dice. Also create a roll interaction with a roll_dice effect and allow it in phase steps.",
    obj({ id, count: int(1, 10), sides: int(2, 1000) }),
    (d, a) => {
      upsert(d.definition.dice, a, "id");
    },
  ),
  tool<GameDefinition["coins"][number]>(
    "add_coin",
    "Add or replace a two-outcome coin. Also create a flip interaction with a flip_coin effect and allow it in phase steps.",
    obj({ id, outcomes: arr(str(64), 2, 2) }),
    (d, a) => {
      upsert(d.definition.coins, a, "id");
    },
  ),
  tool<GameDefinition["hand"]>(
    "create_hand_size",
    "Set initial and maximum hand sizes. The hand is always its own private space.",
    obj({ initial: int(), maximum: int(1) }),
    (d, a) => {
      requireRule(a.initial <= a.maximum, "Initial hand exceeds maximum");
      d.definition.hand = a;
    },
  ),
  tool<{
    phases: {
      id: string;
      name: string;
      ordered: boolean;
      steps: DesignerRules["phases"][number]["steps"];
    }[];
  }>(
    "create_turn_phases",
    "Replace the ordered phase list. Each phase has action budgets and optional enforced step order. Draws and plays use these budgets ONLY; there are no global per-turn draw/play limits. Empty formatId applies to all card types.",
    obj({
      phases: arr(
        obj({ id, name: str(), ordered: bool, steps: arr(stepSchema, 32) }),
        16,
        1,
      ),
    }),
    (d, a) => {
      d.definition.phases = a.phases.map((p) => ({
        id: p.id,
        name: p.name,
        allowedActionIds: [],
        subPhases:
          d.definition.phases.find((old) => old.id === p.id)?.subPhases ?? [],
      }));
      d.rules.phases = a.phases.map((p) => ({
        phaseId: p.id,
        ordered: p.ordered,
        steps: p.steps,
      }));
    },
  ),
  tool<{
    phaseId: string;
    subPhases: GameDefinition["phases"][number]["subPhases"];
  }>(
    "create_sub_phases",
    "Replace sub-phases within one existing phase. Restrict each to a subset of its parent action IDs. Budgets are shared across the parent phase, not reset for each sub-phase.",
    obj({
      phaseId: id,
      subPhases: arr(
        obj({ id, name: str(), allowedActionIds: arr(id, 64) }),
        16,
      ),
    }),
    (d, a) => {
      const phase = d.definition.phases.find((p) => p.id === a.phaseId);
      requireRule(phase, "Create the parent phase first");
      phase.subPhases = a.subPhases;
    },
  ),
  tool<{ startingHealth: number; healthName: string }>(
    "create_life_win_conditions",
    "Set starting health and its display name. Victory occurs through health elimination; other victory conditions are currently unsupported.",
    obj({ startingHealth: int(1, 1_000_000), healthName: str(32) }),
    (d, a) => {
      d.definition.startingHealth = a.startingHealth;
      d.definition.victory = "health";
      d.rules.healthName = a.healthName;
    },
  ),
  tool<{
    minSize: number;
    maxSize: number;
    maxCopies: number;
    allowedFormatIds: string[];
  }>(
    "create_deck_rules",
    "Set deck size and default copy limits. Card-specific limits are set in create_cards. The card pool must be able to fill the minimum deck and the opening hand.",
    obj({
      minSize: int(1),
      maxSize: int(1),
      maxCopies: int(1),
      allowedFormatIds: arr(id, 32),
    }),
    (d, a) => {
      requireRule(a.minSize <= a.maxSize, "Deck minimum exceeds maximum");
      Object.assign(d.definition.deckRules, a);
    },
  ),
  tool<{ decks: GameDefinition["starterDecks"] }>(
    "create_decks",
    "Create or replace optional starter deck recipes. Recipes are stored with the game; players can build and save their own decks through the existing deckbuilder.",
    obj({ decks: arr(obj({ id, name: str(), entries: entriesSchema }), 16) }),
    (d, a) => {
      for (const deck of a.decks) upsert(d.definition.starterDecks, deck, "id");
    },
  ),
  tool<ResourceRules>(
    "configure_resources",
    "Configure optional named resource pools, per-action/per-card costs and gain/spend effect pool bindings. Empty cardId is the default action cost. Effect bindings identify interaction, trigger flag, effect index and pool. Disable resources unless requested.",
    obj({
      enabled: bool,
      pools: arr(
        obj({
          id,
          name: str(32),
          starting: int(0, 1_000_000),
          perTurn: int(0, 1_000_000),
        }),
        8,
        1,
      ),
      costs: arr(
        obj({
          actionId: id,
          cardId: str(64, 0),
          amounts: arr(obj({ poolId: id, amount: int(0, 1_000_000) }), 8),
        }),
        2048,
      ),
      effects: arr(
        obj({
          interactionId: id,
          isTrigger: bool,
          effectIndex: int(0, 31),
          poolId: id,
        }),
        2048,
      ),
    }),
    (d, a) => {
      d.resources = a;
      d.definition.setup.startingResource = a.enabled ? a.pools[0].starting : 0;
      d.definition.setup.turnResource = a.enabled ? a.pools[0].perTurn : 0;
    },
  ),
  tool<SpecialRules>(
    "configure_special_cards",
    "Set reaction timing and persistent field modifiers for Trap/Reaction and Field Effect cards. Requires rules for every card with either preset.",
    obj({
      reactions: arr(
        obj({
          cardId: id,
          onActions: arr(actionKinds, 6, 1),
          discardAfterUse: bool,
        }),
        48,
      ),
      fields: arr(
        obj({
          cardId: id,
          modifiers: arr(
            obj({
              kind: enumOf(...fieldModifierKinds.map((m) => m.id)),
              scope: enumOf("all", "owner", "opponents"),
              amount: int(-200, 200),
              formatId: str(64, 0),
            }),
            8,
            1,
          ),
        }),
        48,
      ),
    }),
    (d, a) => {
      d.special = a;
    },
  ),
  tool<Record<string, never>>(
    "get_game_draft",
    "Read the complete current draft and its stable IDs when resolving references or repairing errors.",
    obj({}),
    (d) => normalizeDocument(d),
  ),
  tool<Record<string, never>>(
    "validate_game_draft",
    "Check the draft with the same validators used for publication. Repair any returned error using the creation tools.",
    obj({}),
    (d) => {
      validateDocument(d);
      return { valid: true };
    },
  ),
  tool<Record<string, never>>(
    "finish_game",
    "Finish only when the draft is complete, playable and passes publication validation. An invalid draft will return an error; repair it before finishing.",
    obj({}),
    (d) => {
      validateDocument(d);
      return { valid: true, finished: true };
    },
  ),
];

export const toolDefinitions = tools.map(
  ({ name, description, parameters }) => ({
    type: "function",
    name,
    description,
    parameters,
  }),
);

// Each call commits atomically. Failed calls cannot partially alter the draft.
export function executeTool(
  document: AgentDocument,
  name: string,
  args: unknown,
): { document: AgentDocument; result: unknown; finished: boolean } {
  const selected = tools.find((t) => t.name === name);
  requireRule(selected, `Unknown tool: ${name}`);
  const next = structuredClone(document);
  const result = selected.apply(next, args);
  validateDraftBounds(next.definition);
  requireRule(JSON.stringify(next).length <= 500_000, "Draft exceeds 500 KB");
  // Starter decks receive full reference/copy validation at finish, allowing tools in any order.
  return {
    document: name === "finish_game" ? validateDocument(next) : next,
    result: result ?? { ok: true },
    finished: name === "finish_game",
  };
}
