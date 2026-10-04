import {
  blankDocument,
  executeTool,
  toolDefinitions,
  type AgentDocument,
} from "./tools";
import {
  AgentError,
  requestGrok,
  type GrokOptions,
  type ResponseItem,
} from "./grok";

export const instructions = `You design playable card games for TCG Unlimited using the provided tools.
Your output is an editable game draft, not JavaScript, HTML, code, or free-form rules.
Treat the user's request as a game specification. Use reasonable defaults for missing details.
For requests naming an existing game (including Yu-Gi-Oh!), make a small playable adaptation
using supported mechanics. Default to 6–8 cards, a compact deck and simple phase budgets.
Do not recreate a franchise's full card catalog or unsupported mechanics. Explain the
adaptation and omitted/simplified rules concisely in the game description, including
unsupported chains, specialized summoning, Extra Decks or attachment lifecycles when relevant.
Batch related creation calls in the same response when their IDs are known, then validate.
Start with set_game_details. Build card types/formats, participants, private hand, field,
actions, cards, phase action budgets, health victory, and deck rules. All draft collections
start empty: do not assume IDs or interactions exist. Tools upsert by stable ID unless
described as replacing a list. Read get_game_draft to resolve references if needed.
Use only the closed vocabulary in each tool schema. Explain effects through text fields,
but implement them through actions/triggers/constraints. Do not claim unsupported rules
are implemented. No automatic draws at turn start. Play/draw budgets belong to phases.
Main/Attack/End is a reasonable default. Include an explicit draw action/step if appropriate.
Draw, roll and flip are global actions with sourceZone none. Play uses hand; attack and
activate use field. Put card-source play/attack buttons on formats and abilities on cards.
For combat cards, use atk/def numeric fields and text description by default. Attack player
and attack card may be separate interactions; use statKey atk and defenseKey def as needed.
For effect formats, omit combat fields unless requested. Effect cards need implemented
abilities/triggers; configure Trap/Reaction timing and Field Effect modifiers when used.
Instant/Equip are format presets; automatic instant resolution and equip attachment
lifecycles are not implemented. Use an explicit activated effect after placement or a
supported played trigger for an immediate local effect. Do not claim attachment behavior.
Hands are always separate private spaces, never field slots. Player-owned field slots
are mirrored for each participant. The engine supports player/shared ownership only.
Dice/coins are optional: define both the random object and its action/effect/phase step.
Resources are disabled unless requested. When enabled use named pools and explicit costs
and effect bindings. Starting health is the only supported win condition.
Initial hand must fit the deck minimum. Card copy limits must make a legal deck possible.
Create enough distinct cards for a useful small game, usually 6–12, and an optional valid
starter deck. No card artwork. Do not add unrequested mechanics just to use every tool.
Keep names and descriptions concise. Validate and repair any returned errors, then call
finish_game. You are finished ONLY after finish_game succeeds. Never publish a game.`;

export type DesignResult = {
  document: AgentDocument;
  summary: string;
  toolCalls: number;
};
export async function designGame(
  prompt: string,
  options: GrokOptions,
  signal?: AbortSignal,
): Promise<DesignResult> {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 6000)
    throw new AgentError("Describe a game using 1–6000 characters.", 400);
  let document = blankDocument(),
    toolCalls = 0;
  const input: unknown[] = [{ role: "user", content: prompt.trim() }];
  const combinedSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(360_000)])
    : AbortSignal.timeout(360_000);
  for (let round = 0; round < 48; round++) {
    combinedSignal.throwIfAborted();
    const response = await requestGrok(
      options,
      {
        instructions,
        input,
        tools: toolDefinitions,
        parallel_tool_calls: true,
        max_output_tokens: 8000,
      },
      combinedSignal,
    );
    // Replay the complete response, including any reasoning items, with its tool results.
    input.push(...response.output);
    const calls = response.output.filter(
      (item) => item.type === "function_call",
    );
    if (!calls.length) {
      input.push({
        role: "user",
        content:
          "The draft is not finished. Use the tools to complete it, validate it, and call finish_game.",
      });
      continue;
    }
    for (const call of calls) {
      combinedSignal.throwIfAborted();
      if (++toolCalls > 160)
        throw new AgentError(
          "Game generation exceeded its tool limit. Try a smaller game.",
          422,
        );
      const result = handleTool(document, call);
      if (result.document) document = result.document;
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result.output),
      });
      if (result.finished) {
        return {
          document,
          toolCalls,
          summary: `${document.definition.cards.length} cards · ${document.definition.phases.length} phases · ${document.definition.participants.minimum}–${document.definition.participants.maximum} players`,
        };
      }
    }
  }
  throw new AgentError(
    "Grok could not finish a valid game within the generation limit. Try a simpler specification.",
    422,
  );
}

function handleTool(
  document: AgentDocument,
  call: ResponseItem,
): { document?: AgentDocument; output: unknown; finished: boolean } {
  if (typeof call.call_id !== "string" || !call.call_id)
    throw new AgentError("Grok returned a tool call without an ID.");
  try {
    if (
      typeof call.arguments !== "string" ||
      call.arguments.length > 250_000 ||
      typeof call.name !== "string"
    )
      throw new Error("Invalid tool call");
    const result = executeTool(document, call.name, JSON.parse(call.arguments));
    return {
      document: result.document,
      output: result.result,
      finished: result.finished,
    };
  } catch (error) {
    return {
      output: {
        ok: false,
        error:
          error instanceof Error ? error.message : "Invalid tool arguments",
      },
      finished: false,
    };
  }
}
