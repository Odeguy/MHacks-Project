import type {
  ActionInput,
  GameDefinition,
  MatchState,
  SpecialRules,
} from "./contracts";
import { performAction, type RandomInt } from "./engine";
import { canAfford, type ResourceContext } from "./resources";
import { requireRule } from "./validation";

export function reactionActions(
  game: GameDefinition,
  state: MatchState,
  special: SpecialRules | undefined,
  seat: number,
  kind: string,
  resources?: ResourceContext,
) {
  const player = state.players.find((p) => p.seat === seat);
  if (!player || player.eliminated || state.status !== "active") return [];
  return state.cards
    .filter((c) => c.zone === "field" && c.ownerSeat === seat)
    .flatMap((card) => {
      const rule = special?.reactions.find(
        (r) => r.cardId === card.cardId && r.onActions.includes(kind),
      );
      if (!rule) return [];
      const definition = game.cards.find((c) => c.id === card.cardId)!;
      const format = game.formats.find((f) => f.id === definition.formatId)!;
      return game.actions
        .filter(
          (a) =>
            a.kind === "activate" &&
            a.sourceZone === "field" &&
            [...definition.actionIds, ...format.buttons].includes(a.id) &&
            (!a.oncePerTurn ||
              !state.uses.some(
                (u) =>
                  u.seat === seat &&
                  u.actionId === a.id &&
                  u.cardInstanceId === card.id,
              )) &&
            canAfford(game, state, seat, a, card.cardId, special, resources),
        )
        .map((action) => ({ card, action, rule }));
    });
}

export function reactionSeats(
  game: GameDefinition,
  state: MatchState,
  rules: SpecialRules | undefined,
  originSeat: number,
  kind: string,
  resources?: ResourceContext,
) {
  const seats = state.players
    .filter(
      (p) =>
        p.seat !== originSeat &&
        reactionActions(game, state, rules, p.seat, kind, resources).length,
    )
    .map((p) => p.seat)
    .sort((a, b) => a - b);
  return [
    ...seats.filter((s) => s > originSeat),
    ...seats.filter((s) => s < originSeat),
  ];
}

export function performReaction(
  game: GameDefinition,
  state: MatchState,
  rules: SpecialRules | undefined,
  seat: number,
  revision: number,
  kind: string,
  input: ActionInput,
  random: RandomInt,
  resources?: ResourceContext,
) {
  const selected = reactionActions(game, state, rules, seat, kind, resources).find(
    (r) =>
      r.card.id === input.sourceInstanceId && r.action.id === input.actionId,
  );
  requireRule(selected, "Choose an eligible placed Trap/Reaction effect");
  return performAction(game, state, seat, revision, input, random, {
    special: rules,
    resources,
    reaction: true,
    discardSource: selected.rule.discardAfterUse,
  });
}
