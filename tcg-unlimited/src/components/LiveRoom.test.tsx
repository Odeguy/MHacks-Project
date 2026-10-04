import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { exampleGame } from "../../spacetimedb/src/example";
import type { VisibleCardProjection } from "../module_bindings/types";
import LiveRoom from "./LiveRoom";

const mocks = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  call: vi.fn(),
  takeAction: vi.fn(),
}));

vi.mock("../GameDataContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../GameDataContext")>()),
  useGameData: () => mocks.data,
}));
vi.mock("../PreviewContext", () => ({
  usePreview: () => ({
    notify: vi.fn(),
    nightMode: false,
    cardColorChoices: {},
  }),
}));

function setup({
  activeSeat = 1,
  pending = false,
  status = "active",
  phaseIndex = 0,
} = {}) {
  const definition = exampleGame();
  const card = (
    instanceId: number,
    cardId: string,
    ownerSeat: number,
    zone: string,
    slotId = "",
  ): VisibleCardProjection => ({
    id: `visible-${instanceId}`,
    matchId: 10n,
    instanceId,
    cardId,
    ownerSeat,
    zone,
    slotId,
    position: 0,
    values: definition.cards.find((item) => item.id === cardId)!.values.map(
      (value) => ({
        ...value,
        numberValue: value.key === "atk" ? 9 : value.numberValue,
      }),
    ),
  });
  const visibleCards = [
    card(11, "scout", 0, "hand"),
    card(22, "scout", 0, "field", "unit_0"),
    card(33, "guard", 1, "field", "unit_0"),
  ];
  mocks.call.mockReset();
  mocks.takeAction.mockReset().mockResolvedValue(false);
  const data = {
    ready: true,
    pending,
    rooms: [
      { id: 1n, versionId: 7n, name: "Test game", status, playerCount: 2 },
    ],
    versions: [{ id: 7n, gameId: 2n, definition }],
    memberships: [{ roomId: 1n, seat: 0, deckId: 3n, ready: true }],
    participants: [
      { id: 1n, roomId: 1n, seat: 0 },
      { id: 2n, roomId: 1n, seat: 1 },
    ],
    matches: [
      {
        id: 10n,
        roomId: 1n,
        status,
        activeSeat,
        phaseIndex,
        subPhaseIndex: 0,
        turn: 2,
        revision: 4,
      },
    ],
    players: [0, 1].map((seat) => ({
      matchId: 10n,
      seat,
      health: 20,
      resource: 3,
      eliminated: false,
      handCount: 1,
      deckCount: 5,
    })),
    visibleCards,
    decks: [],
    users: [],
    versionRuleRows: [],
    versionSpecialRows: [],
    versionResourceRows: [],
    resourceBalances: [],
    reactionWindows: [],
    history: [],
    call: mocks.call,
    takeAction: mocks.takeAction,
  };
  mocks.data = data;
  return data;
}

function room() {
  return (
    <MemoryRouter initialEntries={["/rooms/room-1"]}>
      <Routes>
        <Route path="/rooms/:roomId" element={<LiveRoom />} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(cleanup);

describe("in-game card preview", () => {
  it("shows a hand card's readable details and live stats out of turn without selecting an action", () => {
    setup();
    render(room());
    const handCard = screen.getByRole("button", {
      name: "Select Scout from hand",
    });
    const action = screen.getByRole("combobox", { name: "Match action" });
    expect(action).toHaveValue("draw");
    expect(handCard).toBeEnabled();

    fireEvent.click(handCard);

    const preview = within(
      screen.getByRole("complementary", { name: "Card preview" }),
    );
    expect(preview.getByRole("heading", { name: "Scout" })).toBeVisible();
    expect(
      preview.getByText("Regain one resource when played."),
    ).toBeVisible();
    expect(preview.getByText("9")).toBeVisible();
    expect(handCard).toHaveAttribute("aria-pressed", "false");
    expect(action).toHaveValue("draw");
    expect(mocks.takeAction).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it("allows inspecting an opponent's visible field card without targeting it out of turn", () => {
    setup();
    render(room());
    const opponentCard = screen.getByRole("button", {
      name: "Target Guard on unit_0",
    });
    expect(opponentCard).toBeEnabled();
    fireEvent.click(opponentCard);

    const preview = within(
      screen.getByRole("complementary", { name: "Card preview" }),
    );
    expect(preview.getByRole("heading", { name: "Guard" })).toBeVisible();
    expect(preview.getByText("A sturdy defender.")).toBeVisible();
    expect(opponentCard).not.toHaveClass("selected");
    expect(mocks.takeAction).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it.each([
    { label: "an action is pending", pending: true, status: "active" },
    { label: "the match is finished", pending: false, status: "finished" },
  ])("allows inspection when $label", ({ pending, status }) => {
    setup({ activeSeat: 0, pending, status });
    render(room());
    const handCard = screen.getByRole("button", {
      name: "Select Scout from hand",
    });
    fireEvent.click(handCard);

    expect(
      screen.getByRole("complementary", { name: "Card preview" }),
    ).toBeVisible();
    expect(handCard).toHaveAttribute("aria-pressed", "false");
    expect(mocks.takeAction).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it("preserves selecting a source and target on the player's turn", async () => {
    setup({ activeSeat: 0, phaseIndex: 1 });
    render(room());
    const source = screen.getByRole("button", {
      name: "Select Scout on unit_0",
    });
    fireEvent.click(source);
    fireEvent.change(screen.getByRole("combobox", { name: "Match action" }), {
      target: { value: "attack_card" },
    });
    const target = screen.getByRole("button", {
      name: "Target Guard on unit_0",
    });
    fireEvent.click(target);

    expect(source).toHaveClass("selected");
    expect(target).toHaveClass("selected");
    expect(screen.getByRole("combobox", { name: "Target card" })).toHaveValue(
      "33",
    );
    expect(
      within(
        screen.getByRole("complementary", { name: "Card preview" }),
      ).getByRole("heading", { name: "Guard" }),
    ).toBeVisible();
    expect(mocks.takeAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Close card preview" }));
    expect(source).toHaveClass("selected");
    expect(target).toHaveClass("selected");
    fireEvent.click(screen.getByRole("button", { name: "Perform action" }));
    await waitFor(() =>
      expect(mocks.takeAction).toHaveBeenCalledWith(10n, 4, {
        actionId: "attack_card",
        sourceInstanceId: 22,
        targetSeat: undefined,
        targetInstanceId: 33,
        slotId: undefined,
      }),
    );
  });

  it("closes with its close button or Escape", () => {
    setup();
    render(room());
    const handCard = screen.getByRole("button", {
      name: "Select Scout from hand",
    });
    fireEvent.click(handCard);
    fireEvent.click(screen.getByRole("button", { name: "Close card preview" }));
    expect(
      screen.queryByRole("complementary", { name: "Card preview" }),
    ).not.toBeInTheDocument();

    fireEvent.click(handCard);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("complementary", { name: "Card preview" }),
    ).not.toBeInTheDocument();
  });

  it("removes the preview when the selected card is no longer visible", () => {
    const data = setup();
    const view = render(room());
    fireEvent.click(
      screen.getByRole("button", { name: "Select Scout from hand" }),
    );
    expect(
      screen.getByRole("complementary", { name: "Card preview" }),
    ).toBeVisible();

    data.visibleCards = data.visibleCards.filter(
      (card) => card.instanceId !== 11,
    );
    view.rerender(room());
    expect(
      screen.queryByRole("complementary", { name: "Card preview" }),
    ).not.toBeInTheDocument();
  });

  it("keeps empty slots unavailable out of turn and opponent hand cards hidden", () => {
    setup();
    render(room());
    expect(
      screen.getByRole("button", { name: "Play in unit_1 (1, 2), player 1" }),
    ).toBeDisabled();
    const hiddenHand = screen.getByLabelText("Opponent hand, face down");
    expect(within(hiddenHand).queryByRole("button")).not.toBeInTheDocument();
    expect(within(hiddenHand).queryByRole("heading")).not.toBeInTheDocument();
    fireEvent.click(hiddenHand.firstElementChild!);
    expect(
      screen.queryByRole("complementary", { name: "Card preview" }),
    ).not.toBeInTheDocument();
    expect(mocks.takeAction).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
  });
});
