import { assertSchema, obj } from "./schema";
import { toolDefinitions, type AgentDocument } from "./tools";

export const maxCardsPerResponse = 3;
export const maxGeneratedCards = 8;
export const maxCallsPerResponse = 6;
export const stageNames = ["setup", "mechanics", "cards", "finish"] as const;
export type GenerationStage = (typeof stageNames)[number];

export function stageCallLimit(stage: GenerationStage, repair: boolean) {
  return stage === "mechanics" || repair ? 3 : maxCallsPerResponse;
}

const setupTools = [
  "set_game_details",
  "create_card_format",
  "create_participant_limits",
  "create_life_win_conditions",
  "create_hand_size",
  "create_field",
  "create_deck_rules",
  "add_dice",
  "add_coin",
];
const mechanicsTools = [
  "create_card_interaction",
  "create_trigger",
  "create_constraints",
  "create_turn_phases",
  "create_sub_phases",
  "configure_resources",
];
const finishTools = [
  "create_decks",
  "configure_resources",
  "configure_special_cards",
  "validate_game_draft",
  "finish_game",
];
const completeStage = {
  type: "function",
  name: "complete_generation_stage",
  description:
    "Call last, after all tools in this stage succeeded. The server checks required work and advances to the next stage. This does not finish or publish the game.",
  parameters: obj({}),
};

export function generationTools(stage: GenerationStage, repair: boolean) {
  const names =
    stage === "setup"
      ? setupTools
      : stage === "mechanics"
        ? mechanicsTools
        : stage === "cards"
          ? ["create_cards"]
          : finishTools;
  const selected = toolDefinitions
    .filter(
      (tool) =>
        repair || names.includes(tool.name) || tool.name === "get_game_draft",
    )
    .map((tool) => {
      if (tool.name !== "create_cards") return tool;
      const bounded = structuredClone(tool);
      bounded.parameters.properties!.cards.maxItems = maxCardsPerResponse;
      return bounded;
    });
  return stage === "finish" ? selected : [...selected, completeStage];
}

export function stageInstructions(stage: GenerationStage, repair: boolean) {
  const task = {
    setup:
      "Set game details, participants, health, hand, field, card formats and deck rules. Add optional dice/coins only if needed. Plan stable action IDs for format buttons; define actions in the next stage.",
    mechanics:
      "Create interactions, any triggers/constraints, phases and sub-phases. Configure resources only if requested. Define all actions that the future cards will use; plan their stable IDs now.",
    cards:
      "Create a compact initial pool, normally 6–8 distinct cards. Use several responses, each creating at most 3 cards total. Use the existing formats, slots and actions. Complete this stage after the intended pool is built.",
    finish:
      "Configure any special cards, optional starter decks and remaining resource bindings. Call finish_game to validate and finish. It returns precise errors if repairs are needed; fix those and retry. Do not repeat unchanged creation calls or read the full draft unless needed.",
  }[stage];
  return `Current generation stage: ${stage}. ${task}
Use at most ${stageCallLimit(stage, repair)} tool calls per response and at most ${maxCardsPerResponse} card definitions total per response.
The initial generated draft is limited to ${maxGeneratedCards} distinct cards; larger requests become a compact playable adaptation, described honestly in the game description.
${repair ? "Repair the returned validation error using the newly available tools, then call finish_game again." : "Only the tools for this stage are available."}
${stage === "finish" ? "" : "Call complete_generation_stage last when this stage is ready. Do not attempt later-stage work yet."}`;
}

export function checkStageComplete(
  stage: GenerationStage,
  completed: Set<string>,
  document: AgentDocument,
  args: unknown,
) {
  assertSchema(completeStage.parameters, args);
  const required =
    stage === "setup"
      ? setupTools.filter((name) => !["add_dice", "add_coin"].includes(name))
      : stage === "mechanics"
        ? ["create_card_interaction", "create_turn_phases"]
        : ["create_cards"];
  const missing = required.filter((name) => !completed.has(name));
  if (missing.length)
    throw new Error(
      `Complete required stage tools first: ${missing.join(", ")}`,
    );
  if (stage === "cards" && !document.definition.cards.length)
    throw new Error("Create cards before completing this stage");
}
