import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { exampleDocument } from "../designer-model";
import DeckGenerator from "./DeckGenerator";

const mocks = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  save: vi.fn(),
}));
vi.mock("../GameDataContext", () => ({
  useGameData: () => mocks.data,
  cardKey: (version: bigint, id: string) => `${version}:${id}`,
}));
function setup(fetchMock: unknown) {
  const document = exampleDocument();
  mocks.save.mockReset().mockResolvedValue("deck-42");
  mocks.data = {
    ready: true,
    pending: false,
    saveDeck: mocks.save,
    versions: [
      { id: 7n, definition: document.definition },
      { id: 9n, definition: document.definition },
    ],
    gameById: () => ({ versionId: 9n }),
    versionRuleRows: [{ versionId: 7n, rules: document.rules }],
    versionSpecialRows: [],
    versionResourceRows: [],
  };
  vi.stubGlobal("fetch", fetchMock);
  return {
    name: "Patrol",
    explanation: "Balanced cards.",
    entries: document.definition.cards.map((card) => ({
      cardId: card.id,
      quantity: 2,
    })),
  };
}
function Location() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("deck generator in the lobby", () => {
  it("saves against the room version, selects the new deck, and stays in the lobby", async () => {
    vi.stubEnv("VITE_AGENT_URL", "https://tcg-unlimited-agent.onrender.com/");
    const fetchMock = vi.fn();
    const result = setup(fetchMock);
    fetchMock.mockResolvedValue({ ok: true, json: async () => result });
    const select = vi.fn();
    render(
      <MemoryRouter initialEntries={["/rooms/room-5"]}>
        <Location />
        <DeckGenerator gameId="game-2" versionId={7n} onSaved={select} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate deck" }));
    await waitFor(() => expect(select).toHaveBeenCalledWith("deck-42"));
    expect(fetchMock.mock.calls[0][0]).toBe("https://tcg-unlimited-agent.onrender.com/api/agent/deck");
    expect(mocks.save.mock.calls[0][0]).toMatchObject({
      gameId: "game-2",
      versionId: 7n,
      name: "Patrol",
    });
    expect(
      Object.keys(mocks.save.mock.calls[0][0].entries).every((key) =>
        key.startsWith("7:"),
      ),
    ).toBe(true);
    expect(screen.getByTestId("location")).toHaveTextContent("/rooms/room-5");
  });
  it("does not save or select an invalid generated deck", async () => {
    const fetchMock = vi.fn();
    setup(fetchMock);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        name: "Invalid",
        entries: [{ cardId: "invented", quantity: 6 }],
      }),
    });
    const select = vi.fn();
    render(<DeckGenerator gameId="game-2" versionId={7n} onSaved={select} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate deck" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unknown deck card",
    );
    expect(mocks.save).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });
  it("ignores a response that arrives after cancellation", async () => {
    let resolve!: (value: unknown) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const result = setup(fetchMock);
    render(<DeckGenerator gameId="game-2" versionId={7n} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate deck" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    resolve({ ok: true, json: async () => result });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Generate deck" }),
      ).toBeEnabled(),
    );
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
