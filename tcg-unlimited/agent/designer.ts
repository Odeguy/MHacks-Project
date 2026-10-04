import { blankDocument, executeTool, type AgentDocument } from "./tools";
import { randomUUID } from "node:crypto";
import {
  checkStageComplete,
  generationTools,
  stageInstructions,
  stageNames,
  maxCardsPerResponse,
  maxGeneratedCards,
  stageCallLimit,
} from "./generation-stages";
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
Follow the server's current stage. Batch only its related creation calls, then complete that stage.
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
Create enough distinct cards for a useful small game, usually 6–8, and an optional valid
starter deck. No card artwork. Do not add unrequested mechanics just to use every tool.
Keep names and descriptions concise. Validate and repair any returned errors, then call
finish_game. You are finished ONLY after finish_game succeeds. Never publish a game.`;

export type DesignResult = {
  document: AgentDocument;
  summary: string;
  toolCalls: number;
};
export type GenerationProgress = {
  generationId: string;
  stage: (typeof stageNames)[number];
  round: number;
  status: "round" | "complete" | "failed";
  modelMs: number;
  elapsedMs: number;
  calls: number;
  rejected: number;
  repairs: number;
  cards: number;
  incomplete: boolean;
};
type DesignOptions = GrokOptions & {
  onProgress?: (progress: GenerationProgress) => void;
};
export async function designGame(
  prompt: string,
  options: DesignOptions,
  signal?: AbortSignal,
): Promise<DesignResult> {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 6000)
    throw new AgentError("Describe a game using 1–6000 characters.", 400);
  let document = blankDocument(),
    toolCalls = 0;
  let stageIndex = 0,
    repair = false,
    repairs = 0,
    incompleteWithoutProgress = 0;
  const completed = new Set<string>();
  const started = Date.now(),
    generationId = randomUUID();
  const log = (
    progress: Omit<
      GenerationProgress,
      "generationId" | "elapsedMs" | "cards" | "repairs" | "incomplete"
    >,
    incomplete = false,
  ) => {
    const event = {
      ...progress,
      generationId,
      elapsedMs: Date.now() - started,
      cards: document.definition.cards.length,
      repairs,
      incomplete,
    };
    if (options.onProgress) options.onProgress(event);
    else console.info(`[game-generation] ${JSON.stringify(event)}`);
  };
  const input: unknown[] = [{ role: "user", content: prompt.trim() }];
  const combinedSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(360_000)])
    : AbortSignal.timeout(360_000);
  for (let round = 0; round < 48; round++) {
    combinedSignal.throwIfAborted();
    const stage = stageNames[stageIndex];
    const availableTools = generationTools(stage, repair);
    const callLimit = stageCallLimit(stage, repair);
    const allowed = new Set(availableTools.map((tool) => tool.name));
    const requestStarted = Date.now();
    let response;
    try {
      response = await requestGrok(
        options,
        {
          instructions: `${instructions}\n\n${stageInstructions(stage, repair)}`,
          input,
          tools: availableTools,
          tool_choice: "required",
          parallel_tool_calls: true,
          reasoning: { effort: "low" },
          max_output_tokens: 8000,
        },
        combinedSignal,
        { allowIncomplete: true },
      );
    } catch (error) {
      log({
        stage,
        round: round + 1,
        status: "failed",
        modelMs: Date.now() - requestStarted,
        calls: 0,
        rejected: 0,
      });
      throw error;
    }
    const modelMs = Date.now() - requestStarted;
    const incomplete = response.status === "incomplete";
    // Keep completed tools/reasoning unchanged. Truncated items cannot be replayed
    // as valid tool calls; ask for a smaller continuation after their siblings.
    const output = incomplete
      ? response.output.filter((item) => {
          if (["incomplete", "in_progress"].includes(String(item.status)))
            return false;
          if (item.type !== "function_call") return true;
          if (!item.call_id || typeof item.arguments !== "string") return false;
          try {
            JSON.parse(item.arguments);
            return true;
          } catch {
            return false;
          }
        })
      : response.output;
    input.push(...output);
    const calls = output.filter((item) => item.type === "function_call");
    if (!calls.length) {
      incompleteWithoutProgress = incomplete
        ? incompleteWithoutProgress + 1
        : 0;
      log(
        {
          stage,
          round: round + 1,
          status: "round",
          modelMs,
          calls: 0,
          rejected: 0,
        },
        incomplete,
      );
      if (incompleteWithoutProgress >= 3)
        throw new AgentError(
          "Grok repeatedly reached its output limit. Try a smaller game specification.",
        );
      input.push({
        role: "user",
        content: incomplete
          ? "The previous response was interrupted by its output limit. Continue only the unfinished work with fewer calls and short arguments; do not repeat completed tools."
          : "Continue the current stage using its tools. Complete the stage when ready; only finish_game in the final stage can finish the draft.",
      });
      continue;
    }
    let cardsInResponse = 0,
      rejected = 0,
      advanced = false,
      finished = false,
      processed = 0,
      mutations = 0;
    for (const [index, call] of calls.entries()) {
      processed++;
      combinedSignal.throwIfAborted();
      if (++toolCalls > 160)
        throw new AgentError(
          "Game generation exceeded its tool limit. Try a smaller game.",
          422,
        );
      const result = handleTool(document, call, (name, args) => {
        if (index >= callLimit)
          throw new Error(`Use at most ${callLimit} tool calls per response`);
        if (advanced)
          throw new Error(
            "The stage advanced; wait for the next response before making more calls",
          );
        if (!allowed.has(name))
          throw new Error(
            `Tool ${name} is not available in the ${stage} stage`,
          );
        if (
          incomplete &&
          ["complete_generation_stage", "finish_game"].includes(name)
        )
          throw new Error(
            "The response was interrupted; confirm stage completion or finish in the next response",
          );
        if (name === "complete_generation_stage") {
          if (rejected)
            throw new Error("Repair failed calls before completing the stage");
          checkStageComplete(stage, completed, document, args);
          return true;
        }
        if (name === "create_cards") {
          const cards = (args as { cards?: { id: string }[] } | null)?.cards;
          if (Array.isArray(cards)) {
            cardsInResponse += cards.length;
            if (cardsInResponse > maxCardsPerResponse)
              throw new Error(
                `Create at most ${maxCardsPerResponse} cards total per response`,
              );
          }
        }
        return false;
      });
      if (result.advance) {
        stageIndex++;
        advanced = true;
      }
      if (result.document) {
        document = result.document;
        if (call.name !== "get_game_draft") mutations++;
      }
      if (result.failed) {
        rejected++;
        if (
          ["finish_game", "validate_game_draft"].includes(call.name ?? "") &&
          allowed.has(call.name!) &&
          !incomplete
        ) {
          repair = true;
          repairs++;
        }
      } else completed.add(call.name!);
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result.output),
      });
      if (result.finished) {
        finished = true;
        break;
      }
    }
    log(
      {
        stage,
        round: round + 1,
        status: finished ? "complete" : "round",
        modelMs,
        calls: processed,
        rejected,
      },
      incomplete,
    );
    incompleteWithoutProgress =
      incomplete && !mutations ? incompleteWithoutProgress + 1 : 0;
    if (incompleteWithoutProgress >= 3)
      throw new AgentError(
        "Grok repeatedly reached its output limit. Try a smaller game specification.",
      );
    if (incomplete && !finished)
      input.push({
        role: "user",
        content:
          "The previous response was interrupted by its output limit. Completed calls were kept; continue only unfinished work with fewer calls and concise arguments.",
      });
    if (finished) {
      return {
        document,
        toolCalls,
        summary: `${document.definition.cards.length} cards · ${document.definition.phases.length} phases · ${document.definition.participants.minimum}–${document.definition.participants.maximum} players`,
      };
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
  guard: (name: string, args: unknown) => boolean,
): {
  document?: AgentDocument;
  output: unknown;
  finished: boolean;
  failed?: boolean;
  advance?: boolean;
} {
  if (typeof call.call_id !== "string" || !call.call_id)
    throw new AgentError("Grok returned a tool call without an ID.");
  try {
    if (
      typeof call.arguments !== "string" ||
      call.arguments.length > 250_000 ||
      typeof call.name !== "string"
    )
      throw new Error("Invalid tool call");
    const args: unknown = JSON.parse(call.arguments);
    if (guard(call.name, args))
      return {
        output: { ok: true, stageComplete: true },
        finished: false,
        advance: true,
      };
    const result = executeTool(document, call.name, args);
    if (result.document.definition.cards.length > maxGeneratedCards)
      throw new Error(
        `Initial generation allows at most ${maxGeneratedCards} distinct cards; adapt the game to this pool`,
      );
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
      failed: true,
    };
  }
}
