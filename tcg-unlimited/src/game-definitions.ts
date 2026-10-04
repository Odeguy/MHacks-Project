import { exampleGame } from "../spacetimedb/src/example";
import { cards } from "./preview-data";
import type { GameDefinition } from "./module_bindings/types";

export type DesignSettings = {
  name: string;
  prompt: string;
  health: number;
  hand: number;
  players: number;
  rows: number;
  columns: number;
  dice: boolean;
  coin: boolean;
  phases: string;
};

// The manual editor starts from the same supported rules as the backend example.
// Prompt text is a description; it does not generate or execute rules.
export function definitionFromSettings(
  settings: DesignSettings,
): GameDefinition {
  const game = exampleGame();
  const format = game.formats[0];
  game.formats = [...new Set(cards.map((card) => card.type))].map((type) => ({
    ...format,
    id: type.toLowerCase(),
    name: type,
  }));
  game.cards = cards.map((card) => ({
    id: card.id,
    name: card.name,
    formatId: card.type.toLowerCase(),
    values: [
      { key: "atk", numberValue: card.attack, textValue: undefined },
      { key: "def", numberValue: card.defense, textValue: undefined },
      { key: "text", numberValue: undefined, textValue: card.text },
    ],
    actionIds: [],
    triggerIds: [],
  }));
  game.participants = { minimum: 2, maximum: settings.players };
  game.startingHealth = settings.health;
  game.hand = { initial: settings.hand, maximum: Math.max(10, settings.hand) };
  game.spaces = game.spaces.map((space) =>
    space.kind === "hand" ? { ...space, capacity: game.hand.maximum } : space,
  );
  game.field = {
    rows: settings.rows,
    columns: settings.columns,
    slots: Array.from(
      { length: settings.rows * settings.columns },
      (_, index) => ({
        id: `slot_${index}`,
        row: Math.floor(index / settings.columns),
        column: index % settings.columns,
        owner: "player",
        allowedFormatIds: game.formats.map((f) => f.id),
      }),
    ),
  };
  game.constraints[0].conditions[0].value = game.field.slots.length - 1;
  game.constraints[0].message = "Your field is full.";
  if (!settings.dice) {
    game.dice = [];
    game.actions = game.actions.filter((action) => action.kind !== "roll");
  }
  if (!settings.coin) {
    game.coins = [];
    game.actions = game.actions.filter((action) => action.kind !== "flip");
  }
  const actionIds = game.actions.map((action) => action.id);
  game.phases = settings.phases.split(",").map((name, index) => {
    const original = game.phases.find(
      (phase) => phase.name.toLowerCase() === name.trim().toLowerCase(),
    );
    return {
      id: `phase_${index}`,
      name: name.trim(),
      allowedActionIds: (original?.allowedActionIds ?? actionIds).filter((id) =>
        actionIds.includes(id),
      ),
      subPhases: (original?.subPhases ?? []).map((phase) => ({
        ...phase,
        allowedActionIds: phase.allowedActionIds.filter((id) =>
          actionIds.includes(id),
        ),
      })),
    };
  });
  game.deckRules = {
    minSize: 12,
    maxSize: 24,
    maxCopies: 4,
    copyLimits: [],
    allowedFormatIds: game.formats.map((f) => f.id),
  };
  game.starterDecks = [
    {
      id: "balanced",
      name: "Balanced",
      entries: cards.map((card) => ({ cardId: card.id, quantity: 2 })),
    },
  ];
  return game;
}
