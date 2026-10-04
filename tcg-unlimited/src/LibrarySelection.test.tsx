import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { GameGalleryPage, SavedDecksPage } from "./pages";
import { games } from "./preview-data";

const mocks = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  deleteGames: vi.fn(),
  deleteDecks: vi.fn(),
}));
vi.mock("./GameDataContext", () => ({ useGameData: () => mocks.data }));
vi.mock("./PreviewContext", () => ({
  usePreview: () => ({
    favorites: [],
    toggleFavorite: vi.fn(),
    cardColorChoices: {},
  }),
}));
function setup() {
  mocks.deleteGames.mockReset().mockResolvedValue(true);
  mocks.deleteDecks.mockReset().mockResolvedValue(true);
  mocks.data = {
    ready: true,
    pending: false,
    games: games.slice(0, 2),
    ownedGameIds: [games[0].id],
    deleteGames: mocks.deleteGames,
    deleteDecks: mocks.deleteDecks,
    cardsForGame: () => [],
    gameById: (id: string) => games.find((game) => game.id === id),
    decks: [1, 2].map((id) => ({
      id: `deck-${id}`,
      name: `Deck ${id}`,
      gameId: games[id - 1].id,
      entries: {},
      updated: "Saved",
    })),
  };
}
afterEach(cleanup);
describe("library selection", () => {
  it("selects only owned games and deletes exactly the selected IDs", async () => {
    setup();
    render(
      <MemoryRouter>
        <GameGalleryPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Select to delete" }));
    expect(
      screen.getByRole("checkbox", { name: `Select ${games[1].title}` }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search games" }), {
      target: { value: "no matching game" },
    });
    expect(screen.getByRole("button", { name: "Cancel selection" })).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Delete selected (1)" }),
    );
    await waitFor(() =>
      expect(mocks.deleteGames).toHaveBeenCalledWith([games[0].id]),
    );
    expect(
      await screen.findByRole("button", { name: "Select to delete" }),
    ).toBeInTheDocument();
  });
  it("deletes selected decks and retains the selection when deletion fails", async () => {
    setup();
    mocks.deleteDecks.mockResolvedValueOnce(undefined);
    render(
      <MemoryRouter>
        <SavedDecksPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Select to delete" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Deck 2" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Delete selected (1)" }),
    );
    await waitFor(() =>
      expect(mocks.deleteDecks).toHaveBeenCalledWith(["deck-2"]),
    );
    expect(
      screen.getByRole("checkbox", { name: "Select Deck 2" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Select Deck 1" }),
    ).not.toBeChecked();
  });
});
