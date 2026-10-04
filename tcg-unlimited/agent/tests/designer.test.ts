import { describe, expect, it, vi } from "vitest";
import { designGame } from "../designer";
import { requestGrok } from "../grok";
import { blankDocument, executeTool, validateDocument, tools } from "../tools";
import {
  call,
  designCalls,
  fixtureDocument,
  mockGrok,
  effect,
  action,
} from "./fixtures";

describe("Grok game creation", () => {
  it("builds a valid game through all core tools, keeping phase limits and hand space", async () => {
    const fetchMock = vi.fn(mockGrok());
    const result = await designGame("Make a small duel", {
      apiKey: "test-key",
      model: "test-model",
      fetch: fetchMock,
    });
    expect(result.document.definition.cards).toHaveLength(3);
    expect(result.document.definition.hand.initial).toBe(3);
    expect(
      result.document.definition.spaces.find((s) => s.kind === "hand")
        ?.visibility,
    ).toBe("owner");
    expect(result.document.definition.setup.turnDraw).toBe(0);
    expect(result.document.rules.playsPerTurn).toBe(0);
    expect(
      result.document.rules.phases[0].steps.find((s) => s.kind === "play")
        ?.maximum,
    ).toBe(2);
    expect(result.document.resources.enabled).toBe(false);
    expect(() => validateDocument(result.document)).not.toThrow();
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.parallel_tool_calls).toBe(true);
    expect(body.store).toBe(false);
    expect(body.tools).toHaveLength(tools.length);
  });

  it("returns validation failures to Grok for repair before accepting a draft", async () => {
    const bodies: Record<string, unknown>[] = [];
    let round = 0;
    const fake = (async (_url, init) => {
      bodies.push(JSON.parse(init!.body as string));
      return new Response(
        JSON.stringify({
          output:
            round++ === 0 ? [call("finish_game", {}, 100)] : designCalls(),
        }),
      );
    }) as typeof fetch;
    const result = await designGame("Duel", {
      apiKey: "test-key",
      model: "test-model",
      fetch: fake,
    });
    expect(result.document.name).toBe("Pocket duel");
    const input = bodies[1].input as { type?: string; output?: string }[];
    expect(
      input.some(
        (item) =>
          item.type === "function_call_output" &&
          JSON.parse(item.output!).ok === false,
      ),
    ).toBe(true);
  });

  it("supports models that emit one sequential tool call per response", async () => {
    const calls = designCalls();
    let index = 0;
    const fake = (async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      if (index) {
        const last = body.input.at(-1);
        expect(last.type).toBe("function_call_output");
        expect(last.call_id).toBe(calls[index - 1].call_id);
        expect(JSON.parse(last.output).ok).not.toBe(false);
      }
      return new Response(JSON.stringify({ output: [calls[index++]] }));
    }) as typeof fetch;
    expect(
      (
        await designGame("Duel", {
          apiKey: "test-key",
          model: "test-model",
          fetch: fake,
        })
      ).document.name,
    ).toBe("Pocket duel");
    expect(index).toBe(calls.length);
  });

  it("reports invalid arguments and unknown tools without changing the draft", () => {
    const doc = blankDocument();
    expect(() =>
      executeTool(doc, "create_participant_limits", { minimum: 8, maximum: 2 }),
    ).toThrow();
    expect(doc.definition.participants.maximum).toBe(2);
    expect(() =>
      executeTool(doc, "create_participant_limits", {
        minimum: 2,
        maximum: 2,
        code: "anything",
      }),
    ).toThrow("unknown property");
    expect(() => executeTool(doc, "run_code", {})).toThrow("Unknown tool");
    expect(() =>
      executeTool(
        doc,
        "create_participant_limits",
        JSON.parse('{"minimum":2,"maximum":2,"__proto__":{}}'),
      ),
    ).toThrow("unknown property");
  });

  it("rejects unfillable decks and unknown sub-phase actions", () => {
    const doc = fixtureDocument();
    doc.definition.deckRules.minSize = 9;
    doc.definition.deckRules.maxSize = 10;
    doc.definition.starterDecks = [];
    expect(() => validateDocument(doc)).toThrow("minimum deck size");
    const other = fixtureDocument();
    other.definition.phases[0].subPhases[0].allowedActionIds = ["missing"];
    expect(() => validateDocument(other)).toThrow("sub-phase action");
  });

  it("supports named independent resource pools and bindings", () => {
    let doc = fixtureDocument();
    doc = executeTool(
      doc,
      "create_card_interaction",
      action("mana", "activate", "field", "self", [
        effect("gain_resource", "actor", 2),
      ]),
    ).document;
    doc.definition.cards[0].actionIds.push("mana");
    doc.rules.typeRoles[0].role = "effect_atk_def";
    doc = executeTool(doc, "configure_resources", {
      enabled: true,
      pools: [
        { id: "red", name: "Red mana", starting: 3, perTurn: 1 },
        { id: "blue", name: "Blue mana", starting: 2, perTurn: 0 },
      ],
      costs: [
        {
          actionId: "play",
          cardId: "scout",
          amounts: [
            { poolId: "red", amount: 2 },
            { poolId: "blue", amount: 1 },
          ],
        },
      ],
      effects: [
        {
          interactionId: "mana",
          isTrigger: false,
          effectIndex: 0,
          poolId: "blue",
        },
      ],
    }).document;
    expect(validateDocument(doc).resources.pools).toHaveLength(2);
    doc.resources.costs[0].amounts[0].poolId = "missing";
    expect(() => validateDocument(doc)).toThrow("Unknown cost resource pool");
  });

  it("requires and validates special reaction and field rules", () => {
    const doc = fixtureDocument();
    doc.rules.typeRoles.find((r) => r.formatId === "spell")!.role =
      "trap_reaction";
    expect(() => validateDocument(doc)).toThrow("Set reaction timing");
    const reaction = executeTool(doc, "configure_special_cards", {
      reactions: [
        { cardId: "potion", onActions: ["attack"], discardAfterUse: true },
      ],
      fields: [],
    }).document;
    expect(() => validateDocument(reaction)).not.toThrow();
    reaction.rules.typeRoles.find((r) => r.formatId === "spell")!.role =
      "field_effect";
    reaction.special = { reactions: [], fields: [] };
    expect(() => validateDocument(reaction)).toThrow("Set field rules");
    const field = executeTool(reaction, "configure_special_cards", {
      reactions: [],
      fields: [
        {
          cardId: "potion",
          modifiers: [{ kind: "atk", scope: "owner", amount: 1, formatId: "" }],
        },
      ],
    }).document;
    expect(() => validateDocument(field)).not.toThrow();
  });

  it("repairs malformed tool JSON using model feedback", async () => {
    let round = 0;
    const fake = (async () =>
      new Response(
        JSON.stringify({
          output:
            round++ === 0
              ? [
                  {
                    type: "function_call",
                    name: "create_cards",
                    call_id: "broken",
                    arguments: "{",
                  },
                ]
              : designCalls(),
        }),
      )) as typeof fetch;
    expect(
      (
        await designGame("Duel", {
          apiKey: "test-key",
          model: "test-model",
          fetch: fake,
        })
      ).document.name,
    ).toBe("Pocket duel");
  });

  it("caps unfinished generation and honors cancellation", async () => {
    const fetchMock = vi.fn(mockGrok([]));
    await expect(
      designGame("Duel", {
        apiKey: "test-key",
        model: "test-model",
        fetch: fetchMock,
      }),
    ).rejects.toThrow("generation limit");
    expect(fetchMock).toHaveBeenCalledTimes(48);
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockClear();
    await expect(
      designGame(
        "Duel",
        { apiKey: "test-key", model: "test-model", fetch: fetchMock },
        controller.signal,
      ),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not accept model text in place of executing tools", async () => {
    const fake = (async () =>
      new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "I made your game" }],
            },
          ],
        }),
      )) as typeof fetch;
    await expect(
      designGame("Duel", {
        apiKey: "test-key",
        model: "test-model",
        fetch: fake,
      }),
    ).rejects.toThrow("generation limit");
  });

  it("reports missing keys and sanitized upstream errors", async () => {
    await expect(
      requestGrok({ apiKey: "", model: "test-model" }, {}),
    ).rejects.toThrow("not configured");
    await expect(
      requestGrok(
        {
          apiKey: "test-key",
          model: "test-model",
          fetch: (async () =>
            new Response("secret upstream body", {
              status: 401,
            })) as typeof fetch,
        },
        {},
      ),
    ).rejects.toThrow("rejected the API key");
    await expect(
      requestGrok(
        {
          apiKey: "test-key",
          model: "test-model",
          fetch: (async () =>
            new Response(
              JSON.stringify({ status: "incomplete", output: [] }),
            )) as typeof fetch,
        },
        {},
      ),
    ).rejects.toThrow("smaller game");
  });
});
