import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { designGame, type GenerationProgress } from "../designer";
import { tools, validateDocument } from "../tools";
import { call, designCalls, mockGrok } from "./fixtures";
import type { ResponseItem } from "../grok";

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const options = (fetch: typeof globalThis.fetch) => ({
  apiKey: "secret-test-key",
  model: "test-model",
  fetch,
});
const response = (output: ResponseItem[]) =>
  new Response(JSON.stringify({ output }));
const cardArgs = () =>
  JSON.parse(
    designCalls().find((tool) => tool.name === "create_cards")!.arguments!,
  );

describe("bounded game generation", () => {
  it("uses low reasoning, exposes every creation tool across stages and logs safe timing metrics", async () => {
    const upstream = vi.fn(mockGrok());
    const events: GenerationProgress[] = [];
    const result = await designGame("private prompt", {
      ...options(upstream),
      onProgress: (event) => events.push(event),
    });
    const bodies = upstream.mock.calls.map(([, init]) =>
      JSON.parse(init!.body as string),
    );
    expect([...new Set(events.map((event) => event.stage))]).toEqual([
      "setup",
      "mechanics",
      "cards",
      "finish",
    ]);
    const exposed = new Set(
      bodies.flatMap((body) =>
        body.tools.map((tool: { name: string }) => tool.name),
      ),
    );
    for (const tool of tools) expect(exposed.has(tool.name)).toBe(true);
    for (const body of bodies) {
      expect(body.reasoning).toEqual({ effort: "low" });
      expect(body.tool_choice).toBe("required");
      const cards = body.tools.find(
        (tool: { name: string }) => tool.name === "create_cards",
      );
      if (cards) expect(cards.parameters.properties.cards.maxItems).toBe(3);
    }
    expect(events.at(-1)?.status).toBe("complete");
    expect(
      events.every(
        (event) =>
          event.modelMs >= 0 &&
          event.elapsedMs >= event.modelMs &&
          event.rejected === 0,
      ),
    ).toBe(true);
    expect(new Set(events.map((event) => event.generationId)).size).toBe(1);
    expect(JSON.stringify(events)).not.toMatch(
      /private prompt|secret-test-key|Pocket duel/,
    );
    expect(() => validateDocument(result.document)).not.toThrow();
  });

  it("rejects early finish and unavailable stage tools without executing them", async () => {
    let round = 0;
    const upstream = mockGrok();
    const bodies: { input: ResponseItem[] }[] = [];
    const fetchMock = (async (...args) => {
      bodies.push(JSON.parse(args[1]!.body as string));
      if (!round++)
        return response([
          call("finish_game", {}, 100),
          call("create_cards", cardArgs(), 101),
        ]);
      return upstream(...args);
    }) as typeof fetch;
    await designGame("Duel", options(fetchMock));
    const errors = bodies[1].input
      .filter((item) => item.type === "function_call_output")
      .map((item) => JSON.parse(item.output as string));
    expect(errors).toHaveLength(2);
    expect(
      errors.every(
        (error) =>
          error.ok === false &&
          error.error.includes("not available in the setup stage"),
      ),
    ).toBe(true);
  });

  it("enforces the aggregate three-card response budget, even across separate calls", async () => {
    let cardRound = 0;
    const events: GenerationProgress[] = [];
    const upstream = mockGrok();
    const fetchMock = (async (...args) => {
      const body = JSON.parse(args[1]!.body as string);
      if (
        body.instructions.includes("Current generation stage: cards.") &&
        !cardRound++
      ) {
        const cards = cardArgs().cards;
        return response([
          call("create_cards", { cards: cards.slice(0, 2) }, 100),
          call("create_cards", { cards: cards.slice(1) }, 101),
          call("complete_generation_stage", {}, 102),
        ]);
      }
      return upstream(...args);
    }) as typeof fetch;
    const result = await designGame("Duel", {
      ...options(fetchMock),
      onProgress: (event) => events.push(event),
    });
    const rejected = events.find(
      (event) => event.stage === "cards" && event.rejected > 0,
    )!;
    expect(rejected.cards).toBe(2);
    expect(rejected.rejected).toBe(2);
    expect(result.document.definition.cards).toHaveLength(3);
  });

  it("keeps oversized card-pool calls atomic and enables full tools for validation repairs", async () => {
    let cardRound = 0,
      finishRound = 0;
    const upstream = mockGrok();
    const events: GenerationProgress[] = [];
    const repairRequests: string[][] = [];
    const fetchMock = (async (...args) => {
      const body = JSON.parse(args[1]!.body as string);
      if (body.instructions.includes("Current generation stage: cards.")) {
        const round = cardRound++;
        if (round < 3) {
          const base = cardArgs().cards;
          const cards =
            round === 0
              ? base
              : [1, 2, 3].map((n) => ({
                  ...base[1],
                  id: `extra_${round * 3 + n}`,
                }));
          return response([call("create_cards", { cards }, 200 + round)]);
        }
        return response([call("complete_generation_stage", {}, 203)]);
      }
      if (body.instructions.includes("Current generation stage: finish.")) {
        if (!finishRound++) return response([call("finish_game", {}, 300)]);
        repairRequests.push(
          body.tools.map((tool: { name: string }) => tool.name),
        );
        // Force a real publication validation failure, then repair using a setup tool.
        if (finishRound === 2)
          return response([
            call("create_hand_size", { initial: 20, maximum: 20 }, 301),
            call("finish_game", {}, 302),
          ]);
        return response([
          call("create_hand_size", { initial: 3, maximum: 8 }, 303),
          call("finish_game", {}, 304),
        ]);
      }
      return upstream(...args);
    }) as typeof fetch;
    // The first finish succeeds unless its hand is invalid. Set it during setup.
    const wrapped = (async (...args) => {
      const result = await fetchMock(...args);
      const data = await result.json();
      for (const item of data.output)
        if (item.name === "create_hand_size") {
          if (item.call_id !== "call_303" && item.call_id !== "call_301")
            item.arguments = JSON.stringify({ initial: 20, maximum: 20 });
        }
      return response(data.output);
    }) as typeof fetch;
    const result = await designGame("Duel", {
      ...options(wrapped),
      onProgress: (event) => events.push(event),
    });
    expect(result.document.definition.cards).toHaveLength(6);
    expect(
      events.find((event) => event.stage === "cards" && event.rejected)?.cards,
    ).toBe(6);
    expect(repairRequests[0]).toContain("create_hand_size");
    expect(events.at(-1)?.repairs).toBe(2);
    expect(() => validateDocument(result.document)).not.toThrow();
  });

  it("rejects calls beyond the response budget without advancing the stage", async () => {
    let round = 0;
    const events: GenerationProgress[] = [];
    const upstream = mockGrok();
    const fetchMock = (async (...args) => {
      if (!round++)
        return response([
          ...[0, 1, 2, 3, 4, 5].map((index) =>
            call("get_game_draft", {}, 400 + index),
          ),
          call("complete_generation_stage", {}, 406),
        ]);
      return upstream(...args);
    }) as typeof fetch;
    const result = await designGame("Duel", {
      ...options(fetchMock),
      onProgress: (event) => events.push(event),
    });
    expect(events[0]).toMatchObject({
      stage: "setup",
      calls: 7,
      rejected: 1,
      cards: 0,
    });
    expect(events[1].stage).toBe("setup");
    expect(() => validateDocument(result.document)).not.toThrow();
  });

  it("honors cancellation between rounds without starting another model request", async () => {
    const controller = new AbortController();
    const upstream = vi.fn(mockGrok());
    await expect(
      designGame(
        "Duel",
        {
          ...options(upstream),
          onProgress: () => controller.abort(),
        },
        controller.signal,
      ),
    ).rejects.toThrow();
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("reports failed upstream requests without logging their contents", async () => {
    const events: GenerationProgress[] = [];
    const fetchMock = (async () => {
      throw new DOMException("sensitive upstream details", "TimeoutError");
    }) as typeof fetch;
    await expect(
      designGame("private prompt", {
        ...options(fetchMock),
        onProgress: (event) => events.push(event),
      }),
    ).rejects.toThrow();
    expect(events[0].status).toBe("failed");
    expect(JSON.stringify(events)).not.toMatch(
      /sensitive|secret-test-key|private prompt/,
    );
  });

  it("keeps completed calls and reasoning after truncation, without advancing or replaying partial calls", async () => {
    const upstream = mockGrok();
    const events: GenerationProgress[] = [];
    const requests: { input: ResponseItem[]; instructions: string }[] = [];
    let interrupted = false;
    const reasoning = {
      type: "reasoning",
      encrypted_content: "test-encrypted-reasoning",
      status: "completed",
    };
    const fetchMock = (async (...args) => {
      const body = JSON.parse(args[1]!.body as string);
      requests.push(body);
      if (
        !interrupted &&
        body.instructions.includes("Current generation stage: cards.")
      ) {
        interrupted = true;
        return new Response(
          JSON.stringify({
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
            output: [
              reasoning,
              designCalls().find((item) => item.name === "create_cards"),
              call("complete_generation_stage", {}, 900),
              { ...call("finish_game", {}, 901), status: "incomplete" },
              { ...call("create_cards", {}, 902), arguments: "{" },
              { type: "function_call", name: "create_cards", arguments: "{}" },
            ],
          }),
        );
      }
      return upstream(...args);
    }) as typeof fetch;
    const result = await designGame("Duel", {
      ...options(fetchMock),
      onProgress: (event) => events.push(event),
    });
    const next = requests.find((body) =>
      body.input.some(
        (item) =>
          item.type === "function_call_output" && item.call_id === "call_900",
      ),
    )!;
    expect(next.instructions).toContain("Current generation stage: cards.");
    expect(next.input).toContainEqual(reasoning);
    expect(
      next.input.some((item) =>
        ["call_901", "call_902"].includes(item.call_id ?? ""),
      ),
    ).toBe(false);
    expect(events.find((event) => event.incomplete)).toMatchObject({
      cards: 3,
      rejected: 1,
    });
    expect(() => validateDocument(result.document)).not.toThrow();
  });

  it("bounds token-limit continuations that make no progress", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
            output: [],
          }),
        ),
    );
    await expect(designGame("Duel", options(fetchMock))).rejects.toThrow(
      "repeatedly reached its output limit",
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(["content_filter", "unknown"])(
    "does not recover other interruption reasons: %s",
    async (reason) => {
      const fetchMock = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              status: "incomplete",
              incomplete_details: { reason },
              output: [],
            }),
          ),
      );
      await expect(designGame("Duel", options(fetchMock))).rejects.toThrow(
        "could not complete",
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});
