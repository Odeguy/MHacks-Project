import { describe, expect, it } from "vitest";
import { exampleGame } from "../src/example";
import { emptyDefinition, validateDeck, validateGame } from "../src/validation";
import {
  initializeMatch,
  performAction,
  advancePhase,
  concede,
  visibleCards,
  playerSummaries,
} from "../src/engine";
import type {
  ActionInput,
  Effect,
  GameDefinition,
  MatchState,
} from "../src/contracts";
const rng = (min: number) => min;
const input = (
  actionId: string,
  extra: Partial<ActionInput> = {},
): ActionInput => ({
  actionId,
  sourceInstanceId: undefined,
  targetSeat: undefined,
  targetInstanceId: undefined,
  slotId: undefined,
  ...extra,
});
function start(game = exampleGame(), count = 2) {
  return initializeMatch(
    game,
    Array.from({ length: count }, (_, seat) => ({
      seat,
      deckId: BigInt(seat + 1),
      revision: 1,
      entries: game.starterDecks[0].entries,
    })),
    rng,
  );
}
function play(g: GameDefinition, s: MatchState, seat = 0, slotId = "unit_0") {
  const card = s.cards.find((c) => c.ownerSeat === seat && c.zone === "hand")!;
  return performAction(
    g,
    s,
    seat,
    s.revision,
    input("play", { sourceInstanceId: card.id, slotId }),
    rng,
  ).state;
}
function effect(
  kind: string,
  target: string,
  amount = 0,
  extra: Partial<Effect> = {},
): Effect {
  return {
    kind,
    target,
    amount,
    statKey: "",
    defenseKey: "",
    zone: "",
    randomId: "",
    ...extra,
  };
}
describe("publication and deck validation", () => {
  it("accepts the complete example", () =>
    expect(() => validateGame(exampleGame())).not.toThrow());
  it("allows incomplete drafts but rejects their publication", () =>
    expect(() => validateGame(emptyDefinition())).toThrow());
  it.each([
    [
      "unknown button",
      (g: GameDefinition) => g.formats[0].buttons.push("missing"),
    ],
    ["duplicate card", (g: GameDefinition) => g.cards.push(g.cards[0])],
    [
      "unknown card field",
      (g: GameDefinition) => {
        g.cards[0].values[0].key = "missing";
      },
    ],
    [
      "bad coordinates",
      (g: GameDefinition) => {
        g.field.slots[0].column = 20;
      },
    ],
    [
      "public hand",
      (g: GameDefinition) => {
        g.spaces[0].visibility = "public";
      },
    ],
    [
      "public deck",
      (g: GameDefinition) => {
        g.spaces[1].visibility = "public";
      },
    ],
    [
      "unsupported rule",
      (g: GameDefinition) => {
        g.actions[1].effects[0].kind = "execute_js";
      },
    ],
    [
      "unsupported victory",
      (g: GameDefinition) => {
        g.victory = "points";
      },
    ],
    [
      "source-less stat",
      (g: GameDefinition) => {
        g.actions[4].effects[0].statKey = "atk";
      },
    ],
    [
      "unknown dice modifier",
      (g: GameDefinition) => {
        g.actions[1].effects[0].randomId = "bad";
      },
    ],
    [
      "missing source stat",
      (g: GameDefinition) => {
        g.formats[0].fields[0].key = "power";
        g.cards.forEach((c) => {
          c.values[0].key = "power";
        });
      },
    ],
  ])("rejects %s", (_, edit) => {
    const g = exampleGame();
    edit(g);
    expect(() => validateGame(g)).toThrow();
  });
  it("allows incomplete saved decks but rejects them at match start", () => {
    const g = exampleGame();
    expect(validateDeck(g, [], false)).toBe(0);
    expect(() => validateDeck(g, [], true)).toThrow("incomplete");
  });
  it("enforces copy, size, card, and format limits", () => {
    const g = exampleGame();
    expect(() =>
      validateDeck(g, [{ cardId: "scout", quantity: 5 }], false),
    ).toThrow("copies");
    expect(() =>
      validateDeck(g, [{ cardId: "bad", quantity: 1 }], false),
    ).toThrow("Unknown");
    expect(() =>
      validateDeck(
        g,
        [
          { cardId: "scout", quantity: 1 },
          { cardId: "scout", quantity: 1 },
        ],
        false,
      ),
    ).toThrow("Duplicate");
    g.deckRules.copyLimits = [{ cardId: "scout", maximum: 0 }];
    expect(() => validateDeck(g, g.starterDecks[0].entries, true)).toThrow(
      "copies",
    );
  });
});
describe("authoritative matches", () => {
  it("phase triggers do not repeat when only the sub-phase changes", () => {
    const g = exampleGame();
    let s = play(g, start(g));
    const card = s.cards.find((c) => c.zone === "field")!;
    g.cards.find((c) => c.id === card.cardId)!.triggerIds.push("phase_income");
    g.triggers.push({
      id: "phase_income",
      event: "phase_started",
      conditions: [],
      effects: [effect("gain_resource", "actor", 2)],
    });
    const before = s.players[0].resource;
    s = advancePhase(g, s, 0, s.revision, rng).state;
    expect(s.players[0].resource).toBe(before);
    s = advancePhase(g, s, 0, s.revision, rng).state;
    expect(s.players[0].resource).toBe(before + 2);
  });
  it("resolves movement, resource spending, healing, and stat changes in order", () => {
    const g = exampleGame();
    let s = play(g, start(g));
    s.players[0].health = 1;
    const card = s.cards.find((c) => c.zone === "field")!;
    const startingAttack = card.values[0].numberValue!;
    g.actions.find((a) => a.id === "heal")!.effects = [
      effect("spend_resource", "actor", 1),
      effect("heal", "actor", 100),
      effect("change_stat", "source_card", 2, { statKey: "atk" }),
      effect("move", "source_card", 0, { zone: "hand" }),
    ];
    s.subPhaseIndex = 1;
    const before = s.players[0].resource;
    const next = performAction(
      g,
      s,
      0,
      s.revision,
      input("heal", { sourceInstanceId: card.id }),
      rng,
    ).state;
    expect(next.players[0].health).toBe(g.startingHealth);
    expect(next.players[0].resource).toBe(before - 2);
    const changed = next.cards.find((c) => c.id === card.id)!;
    expect(changed.values[0].numberValue).toBe(startingAttack + 2);
    expect(changed.zone).toBe("hand");
    expect(changed.slotId).toBe("");
  });
  it("uses dice amounts and coin-conditioned triggers in the same interaction", () => {
    const g = exampleGame();
    const s = start(g);
    g.actions.find((a) => a.id === "play")!.effects = [
      effect("flip_coin", "actor", 0, { randomId: "coin" }),
      effect("roll_dice", "actor", 0, { randomId: "d6" }),
      effect("damage", "actor", 0, { randomId: "d6" }),
    ];
    g.triggers.find((t) => t.id === "welcome")!.conditions = [
      { kind: "coin_is", target: "actor", value: 0, key: "heads" },
    ];
    validateGame(g);
    const card = s.cards.find(
      (c) => c.zone === "hand" && c.ownerSeat === 0 && c.cardId === "scout",
    )!;
    const result = performAction(
      g,
      s,
      0,
      0,
      input("play", { sourceInstanceId: card.id, slotId: "unit_0" }),
      rng,
    );
    expect(result.outcomes).toHaveLength(2);
    expect(result.state.players[0].health).toBe(19);
    expect(result.state.players[0].resource).toBe(3);
  });
  it("creates unique card instances and immutable deck snapshots", () => {
    const g = exampleGame();
    const s = start(g);
    expect(new Set(s.cards.map((c) => c.id)).size).toBe(12);
    expect(
      playerSummaries(g, s).map((p) => [p.handCount, p.deckCount]),
    ).toEqual([
      [3, 3],
      [3, 3],
    ]);
    g.starterDecks[0].entries[0].quantity = 1;
    expect(s.players[0].deckSnapshot[0].quantity).toBe(3);
  });
  it("shuffles with injected RNG and preserves ownership", () => {
    const g = exampleGame();
    const selections = [0, 1].map((seat) => ({
      seat,
      deckId: BigInt(seat),
      revision: 1,
      entries: g.starterDecks[0].entries,
    }));
    const a = initializeMatch(g, selections, rng);
    const b = initializeMatch(g, selections, (_, max) => max);
    expect(a.cards.map((c) => c.id)).not.toEqual(b.cards.map((c) => c.id));
    expect(a.cards.filter((c) => c.ownerSeat === 0)).toHaveLength(6);
  });
  it("hides all deck cards and opponent hands", () => {
    const g = exampleGame();
    const s = start(g);
    const view = visibleCards(g, s, 0);
    expect(view).toHaveLength(3);
    expect(view.every((c) => c.zone === "hand" && c.ownerSeat === 0)).toBe(
      true,
    );
    expect(playerSummaries(g, s)[1]).not.toHaveProperty("deckSnapshot");
  });
  it("plays into a separate field and resolves on-play triggers", () => {
    const g = exampleGame();
    const s = start(g);
    const scout = s.cards.find(
      (c) => c.ownerSeat === 0 && c.zone === "hand" && c.cardId === "scout",
    )!;
    const next = performAction(
      g,
      s,
      0,
      0,
      input("play", { sourceInstanceId: scout.id, slotId: "unit_0" }),
      rng,
    ).state;
    expect(next.cards.find((c) => c.id === scout.id)?.zone).toBe("field");
    expect(next.players[0].resource).toBe(3);
    expect(s.cards.find((c) => c.id === scout.id)?.zone).toBe("hand");
    expect(s.revision).toBe(0);
    expect(visibleCards(g, next, 1).some((c) => c.id === scout.id)).toBe(true);
  });
  it("rejects wrong turn, stale revisions, and opponent sources", () => {
    const g = exampleGame();
    const s = start(g);
    expect(() => performAction(g, s, 1, 0, input("roll"), rng)).toThrow("turn");
    expect(() => performAction(g, s, 0, 2, input("roll"), rng)).toThrow(
      "changed",
    );
    const enemy = s.cards.find((c) => c.ownerSeat === 1 && c.zone === "hand")!;
    expect(() =>
      performAction(
        g,
        s,
        0,
        0,
        input("play", { sourceInstanceId: enemy.id, slotId: "unit_0" }),
        rng,
      ),
    ).toThrow("control");
  });
  it("rejects extra player targets that could redirect effects", () => {
    const g = exampleGame();
    const s = start(g);
    expect(() =>
      performAction(g, s, 0, 0, input("draw", { targetSeat: 1 }), rng),
    ).toThrow("yourself");
    expect(() =>
      performAction(g, s, 0, 0, input("roll", { targetSeat: 1 }), rng),
    ).toThrow("target");
  });
  it("rejects occupied slots atomically", () => {
    const g = exampleGame();
    const s = play(g, start(g));
    const snapshot = structuredClone(s);
    expect(() => play(g, s)).toThrow("occupied");
    expect(s).toEqual(snapshot);
  });
  it("enforces designated slot format restrictions", () => {
    const g = exampleGame();
    const s = start(g);
    g.field.slots[0].allowedFormatIds = ["other"];
    expect(() => play(g, s)).toThrow("occupy");
  });
  it("records RNG outcomes and prevents repeating once-per-turn actions", () => {
    const g = exampleGame();
    const s = start(g);
    const roll = performAction(g, s, 0, 0, input("roll"), (_, max) => max);
    expect(roll.outcomes).toEqual([{ randomId: "d6", rolls: [6], coin: "" }]);
    expect(() =>
      performAction(g, roll.state, 0, 1, input("roll"), rng),
    ).toThrow("already used");
    expect(
      performAction(g, roll.state, 0, 1, input("flip"), rng).outcomes[0].coin,
    ).toBe("heads");
  });
  it("applies resource costs and action constraints", () => {
    const g = exampleGame();
    const s = start(g);
    s.players[0].resource = 0;
    expect(() => performAction(g, s, 0, 0, input("draw"), rng)).toThrow(
      "resources",
    );
    g.constraints[0].conditions[0].value = 0;
    const placed = play(g, start(g));
    expect(() => play(g, placed, 0, "unit_1")).toThrow("slots");
  });
  it("advances sub-phases, phases, then turns without automatic draws", () => {
    const g = exampleGame();
    let s = start(g);
    s = advancePhase(g, s, 0, s.revision, rng).state;
    expect([s.phaseIndex, s.subPhaseIndex]).toEqual([0, 1]);
    expect(() => play(g, s)).toThrow("phase");
    s = advancePhase(g, s, 0, s.revision, rng).state;
    expect(s.phaseIndex).toBe(1);
    s = advancePhase(g, s, 0, s.revision, rng).state;
    expect(s.phaseIndex).toBe(2);
    s = advancePhase(g, s, 0, s.revision, rng).state;
    expect([s.activeSeat, s.turn, s.phaseIndex, s.subPhaseIndex]).toEqual([
      1, 2, 0, 0,
    ]);
    expect(s.players[1].resource).toBe(4);
    expect(playerSummaries(g, s)[1].handCount).toBe(3);
  });
  it("caps hand size and leaves overflow in the deck", () => {
    const g = exampleGame();
    g.hand.maximum = 3;
    const s = start(g);
    const next = performAction(g, s, 0, 0, input("draw"), rng).state;
    expect(playerSummaries(g, next)[0].handCount).toBe(3);
    expect(playerSummaries(g, next)[0].deckCount).toBe(3);
  });
  it("resolves attack stats and health victory", () => {
    const g = exampleGame();
    let s = play(g, start(g));
    const card = s.cards.find((c) => c.zone === "field")!;
    s.players[1].health = 1;
    s.phaseIndex = 1;
    s.subPhaseIndex = 0;
    s = performAction(
      g,
      s,
      0,
      s.revision,
      input("attack_player", { sourceInstanceId: card.id, targetSeat: 1 }),
      rng,
    ).state;
    expect(s.status).toBe("finished");
    expect(s.winnerSeat).toBe(0);
    expect(() =>
      performAction(g, s, 0, s.revision, input("roll"), rng),
    ).toThrow("ended");
  });
  it("forbids targeting hidden cards", () => {
    const g = exampleGame();
    const s = play(g, start(g));
    s.phaseIndex = 1;
    expect(() =>
      performAction(
        g,
        s,
        0,
        s.revision,
        input("attack_card", {
          sourceInstanceId: s.cards.find((c) => c.zone === "field")!.id,
          targetInstanceId: s.cards.find(
            (c) => c.ownerSeat === 1 && c.zone === "hand",
          )!.id,
        }),
        rng,
      ),
    ).toThrow("visible");
  });
  it("uses defense for card destruction and public discard", () => {
    const g = exampleGame();
    let s = play(g, start(g));
    s.activeSeat = 1;
    s = play(g, s, 1);
    s.activeSeat = 0;
    s.phaseIndex = 1;
    s.uses = [];
    const source = s.cards.find(
      (c) => c.zone === "field" && c.ownerSeat === 0,
    )!;
    const target = s.cards.find(
      (c) => c.zone === "field" && c.ownerSeat === 1,
    )!;
    source.values[0].numberValue = 10;
    const next = performAction(
      g,
      s,
      0,
      s.revision,
      input("attack_card", {
        sourceInstanceId: source.id,
        targetInstanceId: target.id,
      }),
      rng,
    ).state;
    expect(next.cards.find((c) => c.id === target.id)?.zone).toBe("discard");
    expect(visibleCards(g, next, 0).some((c) => c.id === target.id)).toBe(true);
  });
  it("returns the next living player after concession in a larger game", () => {
    const g = exampleGame();
    g.participants.maximum = 3;
    const s = start(g, 3);
    const next = concede(g, s, 0, rng).state;
    expect([next.status, next.activeSeat, next.turn]).toEqual(["active", 1, 2]);
    expect(next.players[1].resource).toBe(4);
    expect(concede(g, next, 2, rng).state.winnerSeat).toBe(1);
  });
  it("skips an active player killed by their own action", () => {
    const g = exampleGame();
    g.participants.maximum = 3;
    g.actions[5].effects.push(effect("damage", "actor", 100));
    const s = start(g, 3);
    const next = performAction(g, s, 0, 0, input("roll"), rng).state;
    expect([next.status, next.activeSeat, next.turn]).toEqual(["active", 1, 2]);
  });
  it("bounds recursive damage triggers and rolls back the whole action", () => {
    const g = exampleGame();
    let s = play(g, start(g));
    s.activeSeat = 1;
    s = play(g, s, 1);
    s.activeSeat = 0;
    s.phaseIndex = 1;
    s.uses = [];
    const target = s.cards.find(
      (c) => c.zone === "field" && c.ownerSeat === 1,
    )!;
    g.cards.find((c) => c.id === target.cardId)!.triggerIds = ["loop"];
    g.triggers.push({
      id: "loop",
      event: "damaged",
      conditions: [],
      effects: [effect("damage", "source_card", 100)],
    });
    const snapshot = structuredClone(s);
    s.cards.find(
      (c) => c.zone === "field" && c.ownerSeat === 0,
    )!.values[0].numberValue = 10;
    const before = structuredClone(s);
    expect(() =>
      performAction(
        g,
        s,
        0,
        s.revision,
        input("attack_card", {
          sourceInstanceId: s.cards.find(
            (c) => c.zone === "field" && c.ownerSeat === 0,
          )!.id,
          targetInstanceId: target.id,
        }),
        rng,
      ),
    ).toThrow("chain");
    expect(s).toEqual(before);
    expect(snapshot.revision).toBe(s.revision);
  });
});
