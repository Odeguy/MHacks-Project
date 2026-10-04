import { t, type Infer } from "spacetimedb/server";

// String discriminators are validated against closed vocabularies before publication.
// All reducer inputs and stored definitions are structured wire values, never code or JSON strings.
export const cardField = t.object("CardField", {
  key: t.string(),
  label: t.string(),
  kind: t.string(),
});
export const cardFormat = t.object("CardFormat", {
  id: t.string(),
  name: t.string(),
  fields: t.array(cardField),
  buttons: t.array(t.string()),
});
export const cardValue = t.object("CardValue", {
  key: t.string(),
  numberValue: t.i32().optional(),
  textValue: t.string().optional(),
});
export const condition = t.object("RuleCondition", {
  kind: t.string(),
  target: t.string(),
  value: t.i32(),
  key: t.string(),
});
export const effect = t.object("CardEffect", {
  kind: t.string(),
  target: t.string(),
  amount: t.i32(),
  statKey: t.string(),
  defenseKey: t.string(),
  zone: t.string(),
  randomId: t.string(),
});
export const action = t.object("GameAction", {
  id: t.string(),
  label: t.string(),
  kind: t.string(),
  sourceZone: t.string(),
  targetKind: t.string(),
  resourceCost: t.u32(),
  oncePerTurn: t.bool(),
  conditions: t.array(condition),
  effects: t.array(effect),
});
export const trigger = t.object("GameTrigger", {
  id: t.string(),
  event: t.string(),
  conditions: t.array(condition),
  effects: t.array(effect),
});
export const constraint = t.object("GameConstraint", {
  id: t.string(),
  actionIds: t.array(t.string()),
  conditions: t.array(condition),
  message: t.string(),
});
export const cardDefinition = t.object("CardDefinition", {
  id: t.string(),
  formatId: t.string(),
  name: t.string(),
  values: t.array(cardValue),
  actionIds: t.array(t.string()),
  triggerIds: t.array(t.string()),
});
export const fieldSlot = t.object("FieldSlot", {
  id: t.string(),
  row: t.u8(),
  column: t.u8(),
  owner: t.string(),
  allowedFormatIds: t.array(t.string()),
});
export const fieldDefinition = t.object("FieldDefinition", {
  rows: t.u8(),
  columns: t.u8(),
  slots: t.array(fieldSlot),
});
export const space = t.object("GameSpace", {
  id: t.string(),
  kind: t.string(),
  visibility: t.string(),
  capacity: t.u32(),
});
export const subPhase = t.object("SubPhase", {
  id: t.string(),
  name: t.string(),
  allowedActionIds: t.array(t.string()),
});
export const phase = t.object("TurnPhase", {
  id: t.string(),
  name: t.string(),
  allowedActionIds: t.array(t.string()),
  subPhases: t.array(subPhase),
});
export const dice = t.object("GameDice", {
  id: t.string(),
  count: t.u8(),
  sides: t.u16(),
});
export const coin = t.object("GameCoin", {
  id: t.string(),
  outcomes: t.array(t.string()),
});
export const deckEntry = t.object("DeckEntry", {
  cardId: t.string(),
  quantity: t.u16(),
});
export const deckRecipe = t.object("DeckRecipe", {
  id: t.string(),
  name: t.string(),
  entries: t.array(deckEntry),
});
export const copyLimit = t.object("CardCopyLimit", {
  cardId: t.string(),
  maximum: t.u16(),
});
export const deckRules = t.object("DeckRules", {
  minSize: t.u16(),
  maxSize: t.u16(),
  maxCopies: t.u16(),
  copyLimits: t.array(copyLimit),
  allowedFormatIds: t.array(t.string()),
});
export const handSize = t.object("HandSize", {
  initial: t.u16(),
  maximum: t.u16(),
});
export const participantLimits = t.object("ParticipantLimits", {
  minimum: t.u8(),
  maximum: t.u8(),
});
export const setup = t.object("GameSetup", {
  startingResource: t.u32(),
  turnResource: t.u32(),
  turnDraw: t.u16(),
});
export const gameDefinition = t.object("GameDefinition", {
  formats: t.array(cardFormat),
  participants: participantLimits,
  field: fieldDefinition,
  spaces: t.array(space),
  cards: t.array(cardDefinition),
  actions: t.array(action),
  triggers: t.array(trigger),
  constraints: t.array(constraint),
  dice: t.array(dice),
  coins: t.array(coin),
  hand: handSize,
  phases: t.array(phase),
  startingHealth: t.u32(),
  victory: t.string(),
  deckRules,
  starterDecks: t.array(deckRecipe),
  setup,
});
export type GameDefinition = Infer<typeof gameDefinition>;
export type Action = Infer<typeof action>;
export type Effect = Infer<typeof effect>;
export type Condition = Infer<typeof condition>;
export type CardDefinition = Infer<typeof cardDefinition>;
export type DeckEntry = Infer<typeof deckEntry>;

export const matchPlayer = t.object("MatchPlayerState", {
  seat: t.u8(),
  health: t.i32(),
  resource: t.i32(),
  eliminated: t.bool(),
  deckId: t.u64(),
  deckRevision: t.u32(),
  deckSnapshot: t.array(deckEntry),
});
export const cardInstance = t.object("MatchCardInstance", {
  id: t.u32(),
  cardId: t.string(),
  ownerSeat: t.u8(),
  zone: t.string(),
  slotId: t.string(),
  position: t.u32(),
  values: t.array(cardValue),
});
export const actionUse = t.object("ActionUse", {
  seat: t.u8(),
  actionId: t.string(),
  cardInstanceId: t.u32(),
});
export const randomOutcome = t.object("RandomOutcome", {
  randomId: t.string(),
  rolls: t.array(t.u16()),
  coin: t.string(),
});
export const matchState = t.object("MatchState", {
  players: t.array(matchPlayer),
  cards: t.array(cardInstance),
  activeSeat: t.u8(),
  phaseIndex: t.u16(),
  subPhaseIndex: t.u16(),
  turn: t.u32(),
  revision: t.u32(),
  status: t.string(),
  winnerSeat: t.u8().optional(),
  uses: t.array(actionUse),
});
export const actionInput = t.object("ActionInput", {
  actionId: t.string(),
  sourceInstanceId: t.u32().optional(),
  targetSeat: t.u8().optional(),
  targetInstanceId: t.u32().optional(),
  slotId: t.string().optional(),
});
export type MatchState = Infer<typeof matchState>;
export type CardInstance = Infer<typeof cardInstance>;
export type ActionInput = Infer<typeof actionInput>;
export type RandomOutcome = Infer<typeof randomOutcome>;

// Additional designer rules live alongside immutable versions so existing definitions migrate intact.
export const phaseStep = t.object("PhaseActionStep", {
  id: t.string(),
  kind: t.string(),
  formatId: t.string(),
  maximum: t.u16(),
});
export const designerRules = t.object("DesignerRules", {
  healthName: t.string(),
  playsPerTurn: t.u16(),
  typeRoles: t.array(
    t.object("CardTypeRole", { formatId: t.string(), role: t.string() }),
  ),
  slotTypes: t.array(
    t.object("SlotType", { id: t.string(), name: t.string() }),
  ),
  slots: t.array(
    t.object("SlotDesignation", { slotId: t.string(), typeId: t.string() }),
  ),
  cardSlots: t.array(
    t.object("CardSlotPermission", {
      cardId: t.string(),
      allowedTypeIds: t.array(t.string()),
    }),
  ),
  phases: t.array(
    t.object("PhaseActionRules", {
      phaseId: t.string(),
      ordered: t.bool(),
      steps: t.array(phaseStep),
    }),
  ),
});
export const ruleProgress = t.object("RuleProgress", {
  turn: t.u32(),
  phaseIndex: t.u16(),
  plays: t.u16(),
  counts: t.array(
    t.object("PhaseStepCount", { stepId: t.string(), count: t.u16() }),
  ),
  lastStep: t.i16(),
});
export type DesignerRules = Infer<typeof designerRules>;
export type RuleProgress = Infer<typeof ruleProgress>;
