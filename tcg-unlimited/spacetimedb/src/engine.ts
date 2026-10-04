import type {
  ActionInput,
  CardInstance,
  Condition,
  DeckEntry,
  Effect,
  GameDefinition,
  MatchState,
  RandomOutcome,
  SpecialRules,
} from "./contracts";
import { bounded, requireRule, validateDeck, validateGame } from "./validation";
import { resourceCosts, resourceValue, changeResource, type ResourceContext } from "./resources";
import {
  fieldAdjustment,
  effectiveCardValues,
  clampLimit,
} from "./field-effects";

export type RandomInt = (minimum: number, maximum: number) => number;
export type DeckSelection = {
  seat: number;
  deckId: bigint;
  revision: number;
  entries: DeckEntry[];
};
type Execution = {
  game: GameDefinition;
  state: MatchState;
  actor: number;
  input: ActionInput;
  random: RandomInt;
  outcomes: RandomOutcome[];
  operations: number;
  depth: number;
  special?: SpecialRules;
  resources?: ResourceContext;
};

function cloneState(s: MatchState): MatchState {
  return {
    ...s,
    players: s.players.map((p) => ({
      ...p,
      deckSnapshot: p.deckSnapshot.map((e) => ({ ...e })),
    })),
    cards: s.cards.map((c) => ({
      ...c,
      values: c.values.map((v) => ({ ...v })),
    })),
    uses: s.uses.map((u) => ({ ...u })),
  };
}
function spaceId(game: GameDefinition, kind: string) {
  const space = game.spaces.find((s) => s.kind === kind);
  requireRule(space, `Missing ${kind} space`);
  return space.id;
}
function player(ctx: Execution, seat: number) {
  const found = ctx.state.players.find((p) => p.seat === seat);
  requireRule(found, "Unknown player");
  return found;
}
function sourceCard(ctx: Execution) {
  return ctx.state.cards.find((c) => c.id === ctx.input.sourceInstanceId);
}
function targetCard(ctx: Execution) {
  return ctx.state.cards.find((c) => c.id === ctx.input.targetInstanceId);
}
function cardStat(ctx: Execution, card: CardInstance | undefined, key: string) {
  const value =
    card &&
    effectiveCardValues(ctx.game, ctx.state, card, ctx.special).find(
      (v) => v.key === key,
    )?.numberValue;
  requireRule(value !== undefined, `Card has no numeric ${key} field`);
  return value;
}
function targetPlayer(ctx: Execution, target: string) {
  const seat = target === "actor" ? ctx.actor : ctx.input.targetSeat;
  requireRule(seat !== undefined, "Action needs a player target");
  return player(ctx, seat);
}
function countZone(ctx: Execution, seat: number, zone: string) {
  return ctx.state.cards.filter((c) => c.ownerSeat === seat && c.zone === zone)
    .length;
}
function conditionsPass(ctx: Execution, conditions: Condition[]) {
  return conditions.every((c) => {
    if (c.kind === "resource_at_least" && ctx.resources && !ctx.resources.rules.enabled) return true;
    if (c.kind === "card_stat_at_least")
      return (
        cardStat(
          ctx,
          c.target === "source_card" ? sourceCard(ctx) : targetCard(ctx),
          c.key,
        ) >= c.value
      );
    if (c.kind === "roll_at_least") {
      const outcome = [...ctx.outcomes]
        .reverse()
        .find((o) => o.randomId === c.key);
      return (
        outcome !== undefined &&
        outcome.rolls.reduce((a, b) => a + b, 0) >= c.value
      );
    }
    if (c.kind === "coin_is") return ctx.outcomes.some((o) => o.coin === c.key);
    const p = targetPlayer(ctx, c.target);
    switch (c.kind) {
      case "resource_at_least":
        return ctx.resources
          ? !ctx.resources.rules.enabled || resourceValue(ctx.resources, p.seat, c.key || undefined) >= c.value
          : p.resource >= c.value;
      case "health_at_least":
        return p.health >= c.value;
      case "hand_count_at_most":
        return countZone(ctx, p.seat, spaceId(ctx.game, "hand")) <= c.value;
      case "field_count_at_most":
        return countZone(ctx, p.seat, "field") <= c.value;
      default:
        return false;
    }
  });
}
function checkVictory(state: MatchState) {
  state.players.forEach((p) => {
    p.eliminated = p.health <= 0;
  });
  const alive = state.players.filter((p) => !p.eliminated);
  if (alive.length <= 1) {
    state.status = "finished";
    state.winnerSeat = alive[0]?.seat;
  }
}
function slotFor(
  ctx: Execution,
  card: CardInstance,
  requested: string | undefined,
) {
  requireRule(requested, "Choose a field slot");
  const slot = ctx.game.field.slots.find((s) => s.id === requested);
  requireRule(slot, "Unknown field slot");
  const definition = ctx.game.cards.find((c) => c.id === card.cardId)!;
  requireRule(
    slot.allowedFormatIds.length === 0 ||
      slot.allowedFormatIds.includes(definition.formatId),
    "Card cannot occupy this slot",
  );
  requireRule(
    !ctx.state.cards.some(
      (c) =>
        c.zone === "field" &&
        c.slotId === slot.id &&
        (slot.owner === "shared" || c.ownerSeat === card.ownerSeat) &&
        c.id !== card.id &&
        !player(ctx, c.ownerSeat).eliminated,
    ),
    "Field slot is occupied",
  );
  return slot.id;
}
function moveCard(ctx: Execution, card: CardInstance, destination: string) {
  if (destination === "field") {
    card.slotId = slotFor(ctx, card, ctx.input.slotId);
  } else {
    const space = ctx.game.spaces.find((s) => s.id === destination);
    requireRule(space, "Unknown destination space");
    const capacity =
      space.kind === "hand"
        ? clampLimit(
            Math.min(space.capacity, ctx.game.hand.maximum) +
              fieldAdjustment(
                ctx.state,
                ctx.special,
                "max_hand",
                card.ownerSeat,
              ),
            1,
          )
        : space.capacity;
    requireRule(
      card.zone === destination ||
        countZone(ctx, card.ownerSeat, destination) < capacity,
      "Destination space is full",
    );
    card.slotId = "";
  }
  card.position = ctx.state.cards
    .filter((c) => c.ownerSeat === card.ownerSeat && c.zone === destination)
    .reduce((m, c) => Math.max(m, c.position + 1), 0);
  card.zone = destination;
}
function draw(ctx: Execution, seat: number, amount: number) {
  bounded(amount, 0, 200, "Draw count");
  const hand = spaceId(ctx.game, "hand");
  const deck = spaceId(ctx.game, "deck");
  const cards = ctx.state.cards
    .filter((c) => c.ownerSeat === seat && c.zone === deck)
    .sort((a, b) => a.position - b.position);
  const room = Math.max(
    0,
    clampLimit(
      ctx.game.hand.maximum +
        fieldAdjustment(ctx.state, ctx.special, "max_hand", seat),
      1,
    ) - countZone(ctx, seat, hand),
  );
  // A full hand leaves remaining cards in the deck; an empty deck causes no loss.
  cards.slice(0, Math.min(amount, room)).forEach((c) => moveCard(ctx, c, hand));
}
function triggerCards(ctx: Execution, event: string, eventCard?: CardInstance) {
  requireRule(ctx.depth < 16, "Trigger chain exceeds 16 levels");
  const cards = eventCard
    ? [eventCard]
    : ctx.state.cards.filter(
        (c) =>
          c.zone === "field" &&
          c.ownerSeat === ctx.state.activeSeat &&
          !player(ctx, c.ownerSeat).eliminated,
      );
  for (const card of cards) {
    const definition = ctx.game.cards.find((c) => c.id === card.cardId)!;
    for (const id of definition.triggerIds) {
      const tr = ctx.game.triggers.find((t) => t.id === id)!;
      if (tr.event !== event) continue;
      const nested: Execution = {
        ...ctx,
        actor: card.ownerSeat,
        depth: ctx.depth + 1,
        input: {
          ...ctx.input,
          sourceInstanceId: card.id,
          targetInstanceId: eventCard?.id,
          targetSeat: undefined,
        },
      };
      if (conditionsPass(nested, tr.conditions))
        applyEffects(nested, tr.effects, tr.id, true);
      ctx.operations = nested.operations;
    }
  }
}
function applyEffects(ctx: Execution, effects: Effect[], interactionId: string, isTrigger = false) {
  for (const [effectIndex, effect] of effects.entries()) {
    requireRule(++ctx.operations <= 256, "Action exceeds 256 effects");
    if (ctx.resources && !ctx.resources.rules.enabled && ["gain_resource", "spend_resource"].includes(effect.kind)) continue;
    if (effect.kind === "roll_dice") {
      const d = ctx.game.dice.find((d) => d.id === effect.randomId)!;
      ctx.outcomes.push({
        randomId: d.id,
        rolls: Array.from({ length: d.count }, () => ctx.random(1, d.sides)),
        coin: "",
      });
      continue;
    }
    if (effect.kind === "flip_coin") {
      const c = ctx.game.coins.find((c) => c.id === effect.randomId)!;
      ctx.outcomes.push({
        randomId: c.id,
        rolls: [],
        coin: c.outcomes[ctx.random(0, 1)],
      });
      continue;
    }
    const card =
      effect.target === "source_card"
        ? sourceCard(ctx)
        : effect.target === "target_card"
          ? targetCard(ctx)
          : undefined;
    let amount = effect.amount;
    if (effect.statKey && effect.kind !== "change_stat")
      amount += cardStat(ctx, sourceCard(ctx), effect.statKey);
    if (effect.randomId) {
      const roll = [...ctx.outcomes]
        .reverse()
        .find((o) => o.randomId === effect.randomId);
      requireRule(
        roll && roll.rolls.length > 0,
        "Roll the referenced dice earlier in this interaction",
      );
      amount += roll.rolls.reduce((a, b) => a + b, 0);
    }
    bounded(
      amount,
      effect.kind === "change_stat" ? -1_000_000 : 0,
      2_000_000,
      "Resolved effect amount",
    );
    if (["move", "discard", "change_stat"].includes(effect.kind)) {
      requireRule(card, "Effect needs a card");
      if (effect.kind === "change_stat") {
        const value = card.values.find((v) => v.key === effect.statKey);
        requireRule(
          value?.numberValue !== undefined,
          "Card has no numeric field to change",
        );
        value.numberValue = Math.max(
          0,
          Math.min(1_000_000, value.numberValue + amount),
        );
      } else
        moveCard(
          ctx,
          card,
          effect.kind === "discard"
            ? spaceId(ctx.game, "discard")
            : effect.zone,
        );
      continue;
    }
    if (effect.kind === "damage" && card) {
      const defense =
        effect.defenseKey &&
        card.values.some(
          (v) => v.key === effect.defenseKey && v.numberValue !== undefined,
        )
          ? cardStat(ctx, card, effect.defenseKey)
          : 0;
      if (amount > defense) {
        triggerCards(ctx, "damaged", card);
        moveCard(ctx, card, spaceId(ctx.game, "discard"));
      }
      continue;
    }
    const p = targetPlayer(ctx, effect.target);
    switch (effect.kind) {
      case "draw":
        draw(ctx, p.seat, amount);
        break;
      case "damage":
        p.health = Math.max(0, p.health - amount);
        break;
      case "heal":
        p.health = Math.min(ctx.game.startingHealth, p.health + amount);
        break;
      case "gain_resource":
      case "spend_resource":
        if (ctx.resources) {
          const poolId = ctx.resources.rules.effects.find(b => b.interactionId === interactionId && b.isTrigger === isTrigger && b.effectIndex === effectIndex)?.poolId ?? ctx.resources.rules.pools[0].id;
          changeResource(ctx.resources, ctx.state, p.seat, poolId, effect.kind === "gain_resource" ? amount : -amount);
        } else if (effect.kind === "gain_resource") p.resource = Math.min(1_000_000, p.resource + amount);
        else {
          requireRule(p.resource >= amount, "Insufficient resources");
          p.resource -= amount;
        }
        break;
      default:
        requireRule(false, "Unsupported effect");
    }
  }
}
function execution(
  game: GameDefinition,
  state: MatchState,
  actor: number,
  input: ActionInput,
  random: RandomInt,
  special?: SpecialRules,
  resources?: ResourceContext,
): Execution {
  return {
    game,
    state,
    actor,
    input,
    random,
    outcomes: [],
    operations: 0,
    depth: 0,
    special,
    resources: resources && { rules: resources.rules, balances: resources.balances.map(p => ({ ...p, amounts: p.amounts.map(a => ({ ...a })) })) },
  };
}
function emptyInput(): ActionInput {
  return {
    actionId: "",
    sourceInstanceId: undefined,
    targetSeat: undefined,
    targetInstanceId: undefined,
    slotId: undefined,
  };
}

export function initializeMatch(
  game: GameDefinition,
  selections: DeckSelection[],
  random: RandomInt,
): MatchState {
  validateGame(game);
  requireRule(
    selections.length >= game.participants.minimum &&
      selections.length <= game.participants.maximum,
    "Invalid participant count",
  );
  requireRule(
    new Set(selections.map((s) => s.seat)).size === selections.length,
    "Duplicate player seats",
  );
  const ordered = [...selections].sort((a, b) => a.seat - b.seat);
  const state: MatchState = {
    players: ordered.map((s) => ({
      seat: s.seat,
      health: game.startingHealth,
      resource: game.setup.startingResource,
      eliminated: false,
      deckId: s.deckId,
      deckRevision: s.revision,
      deckSnapshot: s.entries.map((e) => ({ ...e })),
    })),
    cards: [],
    activeSeat: ordered[0].seat,
    phaseIndex: 0,
    subPhaseIndex: 0,
    turn: 1,
    revision: 0,
    status: "active",
    winnerSeat: undefined,
    uses: [],
  };
  let id = 1;
  for (const s of ordered) {
    validateDeck(game, s.entries, true);
    const cards: CardInstance[] = [];
    for (const entry of s.entries) {
      const definition = game.cards.find((c) => c.id === entry.cardId)!;
      for (let n = 0; n < entry.quantity; n++)
        cards.push({
          id: id++,
          cardId: definition.id,
          ownerSeat: s.seat,
          zone: spaceId(game, "deck"),
          slotId: "",
          position: 0,
          values: definition.values.map((v) => ({ ...v })),
        });
    }
    for (let i = cards.length - 1; i > 0; i--) {
      const j = random(0, i);
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    cards.forEach((c, i) => {
      c.position = i;
    });
    state.cards.push(...cards);
  }
  const ctx = execution(game, state, state.activeSeat, emptyInput(), random);
  state.players.forEach((p) => draw(ctx, p.seat, game.hand.initial));
  return state;
}

export function performAction(
  game: GameDefinition,
  original: MatchState,
  seat: number,
  expectedRevision: number,
  input: ActionInput,
  random: RandomInt,
  options: {
    special?: SpecialRules;
    reaction?: boolean;
    discardSource?: boolean;
    resources?: ResourceContext;
  } = {},
) {
  requireRule(original.status === "active", "Match has ended");
  requireRule(
    original.revision === expectedRevision,
    "Match changed; refresh before retrying",
  );
  requireRule(
    options.reaction || original.activeSeat === seat,
    "It is not your turn",
  );
  const state = cloneState(original);
  const ctx = execution(
    game,
    state,
    seat,
    { ...input },
    random,
    options.special,
    options.resources,
  );
  const actor = player(ctx, seat);
  requireRule(!actor.eliminated, "Player is eliminated");
  const a = game.actions.find((a) => a.id === input.actionId);
  requireRule(a, "Unknown action");
  const phase = game.phases[state.phaseIndex];
  const sub = phase.subPhases[state.subPhaseIndex];
  requireRule(
    options.reaction ||
      (phase.allowedActionIds.includes(a.id) &&
        (!sub || sub.allowedActionIds.includes(a.id))),
    "Action is not allowed in this phase",
  );
  const source = sourceCard(ctx);
  requireRule(
    !options.reaction || a.kind === "activate",
    "Reactions must activate a Trap effect",
  );
  if (a.sourceZone === "none")
    requireRule(
      input.sourceInstanceId === undefined,
      "Action does not use a source card",
    );
  else {
    requireRule(
      source && source.ownerSeat === seat && source.zone === a.sourceZone,
      "You do not control a valid source card",
    );
    const definition = game.cards.find((c) => c.id === source.cardId)!;
    const format = game.formats.find((f) => f.id === definition.formatId)!;
    requireRule(
      definition.actionIds.includes(a.id) || format.buttons.includes(a.id),
      "Card does not support this action",
    );
  }
  if (["own_card", "enemy_card", "any_card"].includes(a.targetKind)) {
    const target = targetCard(ctx);
    requireRule(
      target && target.zone === "field",
      "Target must be a visible field card",
    );
    if (a.targetKind === "own_card")
      requireRule(target.ownerSeat === seat, "Choose your own card");
    if (a.targetKind === "enemy_card")
      requireRule(target.ownerSeat !== seat, "Choose an enemy card");
    requireRule(
      !player(ctx, target.ownerSeat).eliminated,
      "Target is eliminated",
    );
    requireRule(
      input.targetSeat === undefined || input.targetSeat === target.ownerSeat,
      "Target player does not own target card",
    );
    ctx.input.targetSeat = target.ownerSeat;
  } else {
    requireRule(
      input.targetInstanceId === undefined,
      "Action does not accept a card target",
    );
    if (a.targetKind === "none")
      requireRule(
        input.targetSeat === undefined,
        "Action does not accept a target",
      );
    else {
      if (a.targetKind === "self") {
        requireRule(
          input.targetSeat === undefined || input.targetSeat === seat,
          "Action targets yourself",
        );
        ctx.input.targetSeat = seat;
      }
      requireRule(ctx.input.targetSeat !== undefined, "Choose a target player");
      const p = player(ctx, ctx.input.targetSeat);
      requireRule(!p.eliminated, "Target is eliminated");
      if (a.targetKind === "opponent")
        requireRule(p.seat !== seat, "Choose an opponent");
    }
  }
  const needsSlot =
    a.kind === "play" ||
    a.effects.some((e) => e.kind === "move" && e.zone === "field");
  requireRule(
    needsSlot || input.slotId === undefined,
    "Action does not accept a field slot",
  );
  const used = state.uses.some(
    (u) =>
      u.seat === seat &&
      u.actionId === a.id &&
      u.cardInstanceId === (source?.id ?? 0),
  );
  requireRule(!a.oncePerTurn || !used, "Action already used this turn");
  const sourceFormatId =
    game.cards.find((c) => c.id === source?.cardId)?.formatId ?? "";
  const costs = resourceCosts(a, source?.cardId ?? "", ctx.resources?.rules,
    fieldAdjustment(state, options.special, "action_cost", seat, sourceFormatId));
  const resourceCost = costs[0]?.amount ?? 0;
  if (ctx.resources) {
    for (const cost of costs) {
      const pool = ctx.resources.rules.pools.find(p => p.id === cost.poolId)!;
      requireRule(resourceValue(ctx.resources, seat, cost.poolId) >= cost.amount, `Insufficient ${pool.name}`);
    }
  } else requireRule(actor.resource >= resourceCost, "Insufficient resources");
  requireRule(
    conditionsPass(ctx, a.conditions),
    "Action conditions are not satisfied",
  );
  for (const c of game.constraints) {
    if (c.actionIds.length === 0 || c.actionIds.includes(a.id))
      requireRule(conditionsPass(ctx, c.conditions), c.message);
  }
  if (ctx.resources) {
    for (const cost of costs) changeResource(ctx.resources, state, seat, cost.poolId, -cost.amount);
  } else actor.resource -= resourceCost;
  if (a.kind === "play") moveCard(ctx, source!, "field");
  applyEffects(ctx, a.effects, a.id);
  const event =
    a.kind === "play"
      ? "played"
      : a.kind === "attack"
        ? "attacked"
        : a.kind === "activate"
          ? "activated"
          : undefined;
  if (event && source) triggerCards(ctx, event, source);
  if (options.discardSource && source)
    moveCard(ctx, source, spaceId(game, "discard"));
  if (a.oncePerTurn)
    state.uses.push({ seat, actionId: a.id, cardInstanceId: source?.id ?? 0 });
  checkVictory(state);
  recoverActivePlayer(ctx);
  state.revision++;
  return { state, outcomes: ctx.outcomes, resources: ctx.resources?.balances };
}

function nextTurn(ctx: Execution) {
  const { state, game } = ctx;
  const alive = state.players
    .filter((p) => !p.eliminated)
    .map((p) => p.seat)
    .sort((a, b) => a - b);
  const next = alive.find((s) => s > state.activeSeat) ?? alive[0];
  state.activeSeat = next;
  state.turn++;
  state.phaseIndex = 0;
  state.subPhaseIndex = 0;
  state.uses = [];
  ctx.actor = next;
  ctx.input = emptyInput();
  const p = player(ctx, next);
  if (ctx.resources) {
    for (const pool of ctx.resources.rules.pools)
      changeResource(ctx.resources, state, next, pool.id, pool.perTurn);
  } else p.resource = Math.min(1_000_000, p.resource + game.setup.turnResource);
  triggerCards(ctx, "turn_started");
  checkVictory(state);
}
function recoverActivePlayer(ctx: Execution) {
  // Trigger chains can eliminate a player as their turn begins. Skip each such seat.
  for (
    let i = 0;
    i < ctx.state.players.length &&
    ctx.state.status === "active" &&
    player(ctx, ctx.state.activeSeat).eliminated;
    i++
  ) {
    nextTurn(ctx);
    if (ctx.state.status === "active") {
      phaseStarted(ctx);
      checkVictory(ctx.state);
    }
  }
}
function phaseStarted(ctx: Execution) {
  triggerCards(ctx, "phase_started");
  checkVictory(ctx.state);
  if (
    ctx.state.status === "active" &&
    ctx.game.phases[ctx.state.phaseIndex].subPhases.length
  )
    triggerCards(ctx, "sub_phase_started");
}
export function advancePhase(
  game: GameDefinition,
  original: MatchState,
  seat: number,
  expectedRevision: number,
  random: RandomInt,
  special?: SpecialRules,
  resources?: ResourceContext,
) {
  requireRule(
    original.status === "active" && original.activeSeat === seat,
    "Only the active player may advance",
  );
  requireRule(
    original.revision === expectedRevision,
    "Match changed; refresh before retrying",
  );
  const state = cloneState(original);
  const ctx = execution(game, state, seat, emptyInput(), random, special, resources);
  const phase = game.phases[state.phaseIndex];
  if (state.subPhaseIndex + 1 < phase.subPhases.length) {
    state.subPhaseIndex++;
    triggerCards(ctx, "sub_phase_started");
  } else {
    if (state.phaseIndex + 1 < game.phases.length) {
      state.phaseIndex++;
      state.subPhaseIndex = 0;
    } else nextTurn(ctx);
    if (state.status === "active") phaseStarted(ctx);
  }
  checkVictory(state);
  recoverActivePlayer(ctx);
  state.revision++;
  return { state, outcomes: ctx.outcomes, resources: ctx.resources?.balances };
}

export function concede(
  game: GameDefinition,
  original: MatchState,
  seat: number,
  random: RandomInt,
  special?: SpecialRules,
  resources?: ResourceContext,
) {
  requireRule(original.status === "active", "Match has ended");
  const state = cloneState(original);
  const p = state.players.find((p) => p.seat === seat);
  requireRule(p && !p.eliminated, "Player is not active");
  p.health = 0;
  const ctx = execution(game, state, seat, emptyInput(), random, special, resources);
  checkVictory(state);
  recoverActivePlayer(ctx);
  state.revision++;
  return { state, outcomes: ctx.outcomes, resources: ctx.resources?.balances };
}

// Public projections never include deck order, saved-deck IDs, or opponent hand identities.
export function visibleCards(
  game: GameDefinition,
  state: MatchState,
  seat: number,
) {
  return state.cards
    .filter((c) => {
      if (c.zone === "field")
        return !state.players.find((p) => p.seat === c.ownerSeat)?.eliminated;
      const visibility = game.spaces.find((s) => s.id === c.zone)?.visibility;
      return (
        visibility === "public" ||
        (visibility === "owner" && c.ownerSeat === seat)
      );
    })
    .map((c) => ({
      ...c,
      values: c.values.map((v) => ({ ...v })),
      position: c.zone === spaceId(game, "deck") ? 0 : c.position,
    }));
}

export function playerSummaries(game: GameDefinition, state: MatchState) {
  return state.players.map((p) => ({
    seat: p.seat,
    health: p.health,
    resource: p.resource,
    eliminated: p.eliminated,
    handCount: state.cards.filter(
      (c) => c.ownerSeat === p.seat && c.zone === spaceId(game, "hand"),
    ).length,
    deckCount: state.cards.filter(
      (c) => c.ownerSeat === p.seat && c.zone === spaceId(game, "deck"),
    ).length,
  }));
}
