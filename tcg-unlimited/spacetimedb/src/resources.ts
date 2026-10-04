import type {
  GameDefinition,
  MatchState,
  ResourceRules,
  ResourceBalance,
  SpecialRules,
  Action,
} from "./contracts";
import { bounded, requireRule, text } from "./validation";
import { fieldAdjustment } from "./field-effects";

export type ResourceContext = {
  rules: ResourceRules;
  balances: ResourceBalance[];
};

export function legacyResourceRules(game: GameDefinition): ResourceRules {
  return {
    enabled: true,
    pools: [
      {
        id: "resource",
        name: "Resource",
        starting: game.setup.startingResource,
        perTurn: game.setup.turnResource,
      },
    ],
    costs: [],
    effects: [],
  };
}

export function validateResourceRules(
  game: GameDefinition,
  rules: ResourceRules,
) {
  requireRule(
    rules.pools.length >= 1 && rules.pools.length <= 8,
    "Use 1–8 resource pools",
  );
  requireRule(
    new Set(rules.pools.map((p) => p.id)).size === rules.pools.length,
    "Duplicate resource pool ID",
  );
  requireRule(
    new Set(rules.pools.map((p) => p.name.trim().toLowerCase())).size ===
      rules.pools.length,
    "Resource names must be distinct",
  );
  const ids = new Set(rules.pools.map((p) => p.id));
  for (const pool of rules.pools) {
    text(pool.id, "Resource ID", 64);
    text(pool.name, "Resource name", 32);
    bounded(pool.starting, 0, 1_000_000, "Starting resource");
    bounded(pool.perTurn, 0, 1_000_000, "Resource per turn");
  }
  requireRule(
    rules.costs.length <= 2048 && rules.effects.length <= 2048,
    "Too many resource bindings",
  );
  const costKeys = new Set<string>();
  for (const cost of rules.costs) {
    requireRule(
      game.actions.some((a) => a.id === cost.actionId),
      "Unknown resource cost action",
    );
    requireRule(
      !cost.cardId || game.cards.some((c) => c.id === cost.cardId),
      "Unknown resource cost card",
    );
    const key = JSON.stringify([cost.actionId, cost.cardId]);
    requireRule(!costKeys.has(key), "Duplicate resource cost");
    costKeys.add(key);
    requireRule(
      cost.amounts.length <= 8 &&
        new Set(cost.amounts.map((a) => a.poolId)).size === cost.amounts.length,
      "Duplicate or too many cost pools",
    );
    for (const amount of cost.amounts) {
      requireRule(ids.has(amount.poolId), "Unknown cost resource pool");
      bounded(amount.amount, 0, 1_000_000, "Resource cost");
    }
  }
  const effectKeys = new Set<string>();
  for (const binding of rules.effects) {
    const interaction = (binding.isTrigger ? game.triggers : game.actions).find(
      (a) => a.id === binding.interactionId,
    );
    const effect = interaction?.effects[binding.effectIndex];
    requireRule(
      effect && ["gain_resource", "spend_resource"].includes(effect.kind),
      "Unknown resource effect",
    );
    requireRule(ids.has(binding.poolId), "Unknown effect resource pool");
    const key = JSON.stringify([
      binding.interactionId,
      binding.isTrigger,
      binding.effectIndex,
    ]);
    requireRule(!effectKeys.has(key), "Duplicate resource effect binding");
    effectKeys.add(key);
  }
  for (const interaction of [
    ...game.actions,
    ...game.triggers,
    ...game.constraints,
  ]) {
    for (const c of interaction.conditions)
      if (c.kind === "resource_at_least" && c.key)
        requireRule(ids.has(c.key), "Unknown condition resource pool");
  }
}

export function initializeResources(
  state: MatchState,
  rules: ResourceRules,
): ResourceContext {
  const resources = {
    rules,
    balances: state.players.map((p) => ({
      seat: p.seat,
      amounts: rules.enabled
        ? rules.pools.map((pool) => ({
            poolId: pool.id,
            amount: pool.starting,
          }))
        : [],
    })),
  };
  syncPrimaryResource(state, resources);
  return resources;
}

export function resourceValue(
  resources: ResourceContext,
  seat: number,
  poolId = resources.rules.pools[0]?.id,
) {
  return (
    resources.balances
      .find((p) => p.seat === seat)
      ?.amounts.find((a) => a.poolId === poolId)?.amount ?? 0
  );
}

export function syncPrimaryResource(
  state: MatchState,
  resources: ResourceContext,
) {
  for (const p of state.players)
    p.resource = resources.rules.enabled ? resourceValue(resources, p.seat) : 0;
}

export function changeResource(
  resources: ResourceContext,
  state: MatchState,
  seat: number,
  poolId: string,
  amount: number,
) {
  if (!resources.rules.enabled) return;
  const pool = resources.rules.pools.find((p) => p.id === poolId);
  const balance = resources.balances
    .find((p) => p.seat === seat)
    ?.amounts.find((a) => a.poolId === poolId);
  requireRule(pool && balance, "Unknown resource pool or player");
  requireRule(balance.amount + amount >= 0, `Insufficient ${pool.name}`);
  balance.amount = Math.min(1_000_000, balance.amount + amount);
  syncPrimaryResource(state, resources);
}

export function resourceCosts(
  action: Action,
  cardId: string,
  rules?: ResourceRules,
  adjustment = 0,
) {
  if (rules && !rules.enabled) return [];
  const primary = rules?.pools[0]?.id ?? "resource";
  const configured =
    rules?.costs.find((c) => c.actionId === action.id && c.cardId === cardId) ??
    rules?.costs.find((c) => c.actionId === action.id && c.cardId === "");
  const amounts = configured
    ? configured.amounts.map((a) => ({ ...a }))
    : [{ poolId: primary, amount: action.resourceCost }];
  if (!amounts.some((a) => a.poolId === primary))
    amounts.push({ poolId: primary, amount: 0 });
  const first = amounts.find((a) => a.poolId === primary)!;
  first.amount = Math.max(0, Math.min(1_000_000, first.amount + adjustment));
  return amounts.filter((a) => a.amount > 0);
}

export function canAfford(
  game: GameDefinition,
  state: MatchState,
  seat: number,
  action: Action,
  cardId: string,
  special?: SpecialRules,
  resources?: ResourceContext,
) {
  const formatId = game.cards.find((c) => c.id === cardId)?.formatId ?? "";
  const costs = resourceCosts(
    action,
    cardId,
    resources?.rules,
    fieldAdjustment(state, special, "action_cost", seat, formatId),
  );
  return costs.every(
    (c) =>
      (resources
        ? resourceValue(resources, seat, c.poolId)
        : (state.players.find((p) => p.seat === seat)?.resource ?? 0)) >=
      c.amount,
  );
}
