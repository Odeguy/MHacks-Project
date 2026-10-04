import type {
  CardInstance,
  GameDefinition,
  MatchState,
  SpecialRules,
} from "./contracts";

export const fieldModifierKinds = [
  { id: "atk", label: "Attack bonus" },
  { id: "def", label: "Defense bonus" },
  { id: "plays", label: "Plays per phase bonus" },
  { id: "attacks", label: "Attacks per phase bonus" },
  { id: "turn_draw", label: "Draws per phase bonus" },
  { id: "max_hand", label: "Max hand size bonus" },
  { id: "action_cost", label: "Action resource cost bonus" },
] as const;
export const clampLimit = (value: number, minimum = 0) =>
  Math.max(minimum, Math.min(200, value));

type FieldState = {
  cards: Pick<CardInstance, "cardId" | "zone" | "ownerSeat">[];
  players: { seat: number; eliminated: boolean }[];
};
export function activeFieldCards(state: FieldState, rules?: SpecialRules) {
  return state.cards.filter(
    (card) =>
      card.zone === "field" &&
      !state.players.find((p) => p.seat === card.ownerSeat)?.eliminated &&
      rules?.fields.some((field) => field.cardId === card.cardId),
  );
}

export function fieldAdjustment(
  state: FieldState,
  rules: SpecialRules | undefined,
  kind: string,
  seat: number,
  formatId = "",
) {
  return activeFieldCards(state, rules).reduce(
    (sum, card) =>
      sum +
      rules!.fields
        .find((f) => f.cardId === card.cardId)!
        .modifiers.filter(
          (m) =>
            m.kind === kind &&
            (!m.formatId || m.formatId === formatId) &&
            (m.scope === "all" ||
              (m.scope === "owner"
                ? seat === card.ownerSeat
                : seat !== card.ownerSeat)),
        )
        .reduce((amount, m) => amount + m.amount, 0),
    0,
  );
}

export function effectiveCardValues(
  game: GameDefinition,
  state: MatchState,
  card: CardInstance,
  rules?: SpecialRules,
) {
  const formatId = game.cards.find((c) => c.id === card.cardId)!.formatId;
  return card.values.map((value) => ({
    ...value,
    numberValue:
      value.numberValue !== undefined && ["atk", "def"].includes(value.key)
        ? Math.max(
            0,
            Math.min(
              1_000_000,
              value.numberValue +
                fieldAdjustment(
                  state,
                  rules,
                  value.key,
                  card.ownerSeat,
                  formatId,
                ),
            ),
          )
        : value.numberValue,
  }));
}
