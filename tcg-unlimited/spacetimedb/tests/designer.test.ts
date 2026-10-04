import { describe, expect, it } from "vitest";
import { definitionFromSettings } from "../../src/game-definitions";
import { validateGame, validateDeck } from "../src/validation";

const settings = { name: "Test game", prompt: "A duel", health: 25, hand: 4, players: 2, rows: 2, columns: 4, dice: false, coin: false, phases: "Main, Attack, End" };

describe("manual designer definitions", () => {
  it("produces playable rules, valid starter decks, and separate hands", () => {
    const game = definitionFromSettings(settings);
    expect(() => validateGame(game)).not.toThrow();
    expect(validateDeck(game, game.starterDecks[0].entries, true)).toBe(12);
    expect(game.startingHealth).toBe(25);
    expect(game.field.slots).toHaveLength(8);
    expect(game.spaces.find((space) => space.kind === "hand")?.visibility).toBe("owner");
    expect(game.actions.some((action) => action.kind === "roll" || action.kind === "flip")).toBe(false);
    expect(game.phases[0].subPhases.every((phase) => phase.allowedActionIds.every((id) => game.actions.some((action) => action.id === id)))).toBe(true);
  });
  it("retains valid dice and coin actions when enabled and rejects empty phases", () => {
    expect(() => validateGame(definitionFromSettings({ ...settings, dice: true, coin: true }))).not.toThrow();
    expect(() => validateGame(definitionFromSettings({ ...settings, phases: "" }))).toThrow();
  });
});
