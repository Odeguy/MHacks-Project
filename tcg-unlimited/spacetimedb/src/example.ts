import type { Action, Effect, GameDefinition } from "./contracts";
import { emptyDefinition } from "./validation";
function effect(
  kind: string,
  target: string,
  amount = 0,
  extra: Partial<Effect> = {},
): Effect {
  return {
    kind,
    target,
    amount,
    statKey: "",
    defenseKey: "",
    zone: "",
    randomId: "",
    ...extra,
  };
}
function action(
  id: string,
  kind: string,
  sourceZone: string,
  targetKind: string,
  effects: Effect[],
  cost = 0,
): Action {
  return {
    id,
    label: id.replace(/_/g, " "),
    kind,
    sourceZone,
    targetKind,
    resourceCost: cost,
    oncePerTurn: true,
    conditions: [],
    effects,
  };
}
export function exampleGame(): GameDefinition {
  const g = emptyDefinition();
  g.formats = [
    {
      id: "unit",
      name: "Unit",
      fields: [
        { key: "atk", label: "Attack", kind: "number" },
        { key: "def", label: "Defense", kind: "number" },
        { key: "text", label: "Description", kind: "text" },
      ],
      buttons: ["play", "attack_player", "attack_card", "heal"],
    },
  ];
  g.field = {
    rows: 1,
    columns: 3,
    slots: Array.from({ length: 3 }, (_, column) => ({
      id: `unit_${column}`,
      row: 0,
      column,
      owner: "player",
      allowedFormatIds: ["unit"],
    })),
  };
  g.hand = { initial: 3, maximum: 10 };
  g.deckRules = {
    minSize: 6,
    maxSize: 12,
    maxCopies: 4,
    copyLimits: [],
    allowedFormatIds: ["unit"],
  };
  g.dice = [{ id: "d6", count: 1, sides: 6 }];
  g.coins = [{ id: "coin", outcomes: ["heads", "tails"] }];
  g.actions = [
    action("play", "play", "hand", "none", [], 1),
    action("attack_player", "attack", "field", "opponent", [
      effect("damage", "target_player", 0, { statKey: "atk" }),
    ]),
    action("attack_card", "attack", "field", "enemy_card", [
      effect("damage", "target_card", 0, { statKey: "atk", defenseKey: "def" }),
    ]),
    action(
      "heal",
      "activate",
      "field",
      "self",
      [effect("heal", "actor", 2)],
      1,
    ),
    action("draw", "draw", "none", "self", [effect("draw", "actor", 1)], 1),
    action("roll", "roll", "none", "none", [
      effect("roll_dice", "actor", 0, { randomId: "d6" }),
    ]),
    action("flip", "flip", "none", "none", [
      effect("flip_coin", "actor", 0, { randomId: "coin" }),
    ]),
  ];
  g.triggers = [
    {
      id: "welcome",
      event: "played",
      conditions: [],
      effects: [effect("gain_resource", "actor", 1)],
    },
  ];
  g.constraints = [
    {
      id: "space_for_unit",
      actionIds: ["play"],
      conditions: [
        { kind: "field_count_at_most", target: "actor", value: 2, key: "" },
      ],
      message: "Your three unit slots are full.",
    },
  ];
  g.cards = [
    {
      id: "scout",
      formatId: "unit",
      name: "Scout",
      values: [
        { key: "atk", numberValue: 3, textValue: undefined },
        { key: "def", numberValue: 1, textValue: undefined },
        {
          key: "text",
          numberValue: undefined,
          textValue: "Regain one resource when played.",
        },
      ],
      actionIds: [],
      triggerIds: ["welcome"],
    },
    {
      id: "guard",
      formatId: "unit",
      name: "Guard",
      values: [
        { key: "atk", numberValue: 2, textValue: undefined },
        { key: "def", numberValue: 4, textValue: undefined },
        {
          key: "text",
          numberValue: undefined,
          textValue: "A sturdy defender.",
        },
      ],
      actionIds: [],
      triggerIds: [],
    },
  ];
  g.phases = [
    {
      id: "main",
      name: "Main",
      allowedActionIds: ["play", "draw", "heal", "roll", "flip"],
      subPhases: [
        {
          id: "summon",
          name: "Summoning",
          allowedActionIds: ["play", "draw", "roll", "flip"],
        },
        {
          id: "activate",
          name: "Activation",
          allowedActionIds: ["heal", "roll", "flip"],
        },
      ],
    },
    {
      id: "attack",
      name: "Attack",
      allowedActionIds: ["attack_player", "attack_card"],
      subPhases: [
        {
          id: "damage",
          name: "Damage",
          allowedActionIds: ["attack_player", "attack_card"],
        },
      ],
    },
    { id: "end", name: "End", allowedActionIds: [], subPhases: [] },
  ];
  g.starterDecks = [
    {
      id: "balanced",
      name: "Balanced",
      entries: [
        { cardId: "scout", quantity: 3 },
        { cardId: "guard", quantity: 3 },
      ],
    },
  ];
  return g;
}
