import type { ResponseItem } from "../grok";
import { blankDocument, executeTool } from "../tools";

export const effect = (
  kind: string,
  target: string,
  amount: number,
  extra = {},
) => ({
  kind,
  target,
  amount,
  statKey: "",
  defenseKey: "",
  zone: "",
  randomId: "",
  ...extra,
});
export const action = (
  id: string,
  kind: string,
  sourceZone: string,
  targetKind: string,
  effects: unknown[],
) => ({
  id,
  label: id,
  kind,
  sourceZone,
  targetKind,
  resourceCost: 0,
  oncePerTurn: false,
  conditions: [],
  effects,
});
export const call = (
  name: string,
  args: unknown,
  index: number,
): ResponseItem => ({
  type: "function_call",
  call_id: `call_${index}`,
  name,
  arguments: JSON.stringify(args),
});

// Exercises the real creation tools. The mock replaces only the remote model.
export function designCalls(): ResponseItem[] {
  const calls: [string, unknown][] = [
    [
      "set_game_details",
      {
        name: "Pocket duel",
        description: "A small game with phase-limited draws and attacks.",
      },
    ],
    ["create_participant_limits", { minimum: 2, maximum: 2 }],
    ["create_life_win_conditions", { startingHealth: 20, healthName: "HP" }],
    ["create_hand_size", { initial: 3, maximum: 8 }],
    [
      "create_field",
      {
        rows: 2,
        columns: 3,
        slotTypes: [
          { id: "fighter", name: "Fighter" },
          { id: "effect", name: "Effect" },
        ],
        slots: [0, 1, 2].map((column) => ({
          row: 1,
          column,
          owner: "player",
          typeId: "effect",
        })),
      },
    ],
    [
      "create_card_format",
      {
        id: "fighter",
        name: "Fighters",
        format: "basic_atk_def",
        buttons: ["play", "attack"],
      },
    ],
    [
      "create_card_format",
      {
        id: "spell",
        name: "Spells",
        format: "instant_effect",
        buttons: ["play"],
      },
    ],
    ["create_card_interaction", action("play", "play", "hand", "none", [])],
    [
      "create_card_interaction",
      action("attack", "attack", "field", "opponent", [
        effect("damage", "target_player", 0, { statKey: "atk" }),
      ]),
    ],
    [
      "create_card_interaction",
      action("draw", "draw", "none", "self", [effect("draw", "actor", 1)]),
    ],
    [
      "create_card_interaction",
      action("heal", "activate", "field", "self", [effect("heal", "actor", 2)]),
    ],
    [
      "create_trigger",
      {
        id: "arrival",
        event: "played",
        conditions: [],
        effects: [effect("heal", "actor", 1)],
      },
    ],
    [
      "create_cards",
      {
        cards: [
          {
            id: "scout",
            name: "Scout",
            formatId: "fighter",
            values: [
              { key: "atk", numberValue: 3 },
              { key: "def", numberValue: 1 },
              { key: "text", textValue: "Heal 1 on arrival." },
            ],
            actionIds: [],
            triggerIds: ["arrival"],
            allowedSlotTypeIds: ["fighter"],
            limitPerDeck: 3,
          },
          {
            id: "guard",
            name: "Guard",
            formatId: "fighter",
            values: [
              { key: "atk", numberValue: 2 },
              { key: "def", numberValue: 4 },
              { key: "text", textValue: "Defender." },
            ],
            actionIds: [],
            triggerIds: [],
            allowedSlotTypeIds: ["fighter"],
            limitPerDeck: 3,
          },
          {
            id: "potion",
            name: "Potion",
            formatId: "spell",
            values: [{ key: "text", textValue: "Heal 2." }],
            actionIds: ["heal"],
            triggerIds: [],
            allowedSlotTypeIds: ["effect"],
            limitPerDeck: 2,
          },
        ],
      },
    ],
    ["add_dice", { id: "d6", count: 1, sides: 6 }],
    ["add_coin", { id: "coin", outcomes: ["heads", "tails"] }],
    [
      "create_card_interaction",
      action("roll", "roll", "none", "none", [
        effect("roll_dice", "actor", 0, { randomId: "d6" }),
      ]),
    ],
    [
      "create_card_interaction",
      action("flip", "flip", "none", "none", [
        effect("flip_coin", "actor", 0, { randomId: "coin" }),
      ]),
    ],
    [
      "create_turn_phases",
      {
        phases: [
          {
            id: "main",
            name: "Main",
            ordered: false,
            steps: ["draw", "play", "activate", "roll", "flip"].map((kind) => ({
              id: `main_${kind}`,
              kind,
              formatId: "",
              maximum: kind === "play" ? 2 : 1,
            })),
          },
          {
            id: "attack",
            name: "Attack",
            ordered: false,
            steps: [
              { id: "attack_step", kind: "attack", formatId: "", maximum: 1 },
            ],
          },
          { id: "end", name: "End", ordered: false, steps: [] },
        ],
      },
    ],
    [
      "create_sub_phases",
      {
        phaseId: "main",
        subPhases: [
          { id: "draw_first", name: "Draw", allowedActionIds: ["draw"] },
          {
            id: "summon",
            name: "Summoning",
            allowedActionIds: ["play", "heal", "roll", "flip"],
          },
        ],
      },
    ],
    [
      "create_constraints",
      {
        constraints: [
          {
            id: "space",
            actionIds: ["play"],
            conditions: [
              {
                kind: "field_count_at_most",
                target: "actor",
                value: 5,
                key: "",
              },
            ],
            message: "The field is full.",
          },
        ],
      },
    ],
    [
      "create_deck_rules",
      {
        minSize: 6,
        maxSize: 8,
        maxCopies: 3,
        allowedFormatIds: ["fighter", "spell"],
      },
    ],
    [
      "create_decks",
      {
        decks: [
          {
            id: "starter",
            name: "Starter",
            entries: [
              { cardId: "scout", quantity: 3 },
              { cardId: "guard", quantity: 3 },
            ],
          },
        ],
      },
    ],
    ["validate_game_draft", {}],
    ["finish_game", {}],
  ];
  return calls.map(([name, args], i) => call(name, args, i));
}

export function fixtureDocument() {
  return designCalls().reduce(
    (doc, c) => executeTool(doc, c.name!, JSON.parse(c.arguments!)).document,
    blankDocument(),
  );
}

export function mockGrok(calls = designCalls()): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ status: "completed", output: calls }), {
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}
