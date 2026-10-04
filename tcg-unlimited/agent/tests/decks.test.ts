import { describe, expect, it, vi } from "vitest";
import { generateDeck } from "../decks";
import { call, fixtureDocument } from "./fixtures";

const entries = () =>
  fixtureDocument().definition.cards.map((card) => ({
    cardId: card.id,
    quantity: 2,
  }));
const result = () => ({
  name: "Scout patrol",
  entries: entries(),
  explanation: "A balanced deck.",
});
function mockResults(...outputs: unknown[]) {
  let round = 0;
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          output: [
            call(
              "finish_deck",
              outputs[Math.min(round++, outputs.length - 1)],
              round,
            ),
          ],
        }),
      ),
  ) as unknown as typeof fetch;
}
const options = (fetch: typeof globalThis.fetch) => ({
  apiKey: "test-key",
  model: "test-model",
  fetch,
});

describe("deck generation", () => {
  it("uses the existing card pool and forwards phase/resource rules for strategy", async () => {
    const document = fixtureDocument();
    const mock = mockResults(result());
    expect(
      await generateDeck({ ...document, prompt: "Surprise me" }, options(mock)),
    ).toEqual(result());
    const body = JSON.parse(vi.mocked(mock).mock.calls[0][1]!.body as string);
    const snapshot = JSON.parse(body.input[0].content);
    expect(snapshot.definition).toEqual(document.definition);
    expect(snapshot.rules).toEqual(document.rules);
    expect(snapshot.resources).toEqual(document.resources);
    expect(body.tool_choice.name).toBe("finish_deck");
  });
  it.each([
    { ...result(), entries: [{ cardId: "invented", quantity: 6 }] },
    { ...result(), entries: [{ ...entries()[0], quantity: 200 }] },
    { ...result(), entries: [entries()[0]] },
    { ...result(), entries: [entries()[0], entries()[0], entries()[1]] },
  ])(
    "repairs invented cards, excessive copies, incomplete decks and duplicate entries",
    async (invalid) => {
      const mock = mockResults(invalid, result());
      expect(
        await generateDeck(
          { definition: fixtureDocument().definition },
          options(mock),
        ),
      ).toEqual(result());
      const second = JSON.parse(
        vi.mocked(mock).mock.calls[1][1]!.body as string,
      );
      expect(JSON.parse(second.input.at(-1).output).ok).toBe(false);
    },
  );
  it("enforces per-card overrides and allowed formats", async () => {
    const game = fixtureDocument().definition;
    game.starterDecks = [];
    game.deckRules.copyLimits = [{ cardId: game.cards[0].id, maximum: 1 }];
    const legal = {
      ...result(),
      entries: [
        { cardId: game.cards[0].id, quantity: 1 },
        { cardId: game.cards[1].id, quantity: 3 },
        { cardId: game.cards[2].id, quantity: 2 },
      ],
    };
    expect(
      await generateDeck(
        { definition: game },
        options(mockResults(result(), legal)),
      ),
    ).toEqual(legal);
    const other = fixtureDocument().definition;
    const effect = other.cards.find((card) => card.formatId === "spell")!;
    other.deckRules.allowedFormatIds = [other.cards[0].formatId];
    other.starterDecks = [];
    await expect(
      generateDeck(
        { definition: other },
        options(
          mockResults({
            ...result(),
            entries: [{ cardId: effect.id, quantity: 3 }],
          }),
        ),
      ),
    ).rejects.toThrow("legal deck");
  });
  it("rejects invalid game input before making any API request", async () => {
    const mock = mockResults(result());
    await expect(
      generateDeck({ definition: null }, options(mock)),
    ).rejects.toThrow("valid published game");
    expect(mock).not.toHaveBeenCalled();
  });
  it("honors cancellation and bounds repair attempts", async () => {
    const controller = new AbortController();
    controller.abort();
    const mock = mockResults(result());
    await expect(
      generateDeck(
        { definition: fixtureDocument().definition },
        options(mock),
        controller.signal,
      ),
    ).rejects.toThrow();
    expect(mock).not.toHaveBeenCalled();
    const invalid = mockResults({ ...result(), entries: [] });
    await expect(
      generateDeck(
        { definition: fixtureDocument().definition },
        options(invalid),
      ),
    ).rejects.toThrow("legal deck");
    expect(invalid).toHaveBeenCalledTimes(4);
  });
});
