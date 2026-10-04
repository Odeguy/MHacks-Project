import { t } from "spacetimedb/server";
import db from "./schema";
import * as wire from "./contracts";
import {
  emptyDefinition,
  requireRule,
  text,
  validateDraftBounds,
  validateGame,
} from "./validation";
import { run, ownedDraft, insertDraft, type Ctx } from "./helpers";
import { exampleGame } from "./example";
import { validateDesignerRules } from "./designer-rules";
const draftArgs = { draftId: t.u64(), expectedRevision: t.u32() };
function edit(
  ctx: Ctx,
  id: bigint,
  revision: number,
  fn: (g: wire.GameDefinition) => void,
) {
  const draft = ownedDraft(ctx, id, revision);
  fn(draft.definition);
  validateDraftBounds(draft.definition);
  ctx.db.gameDraft.id.update({
    ...draft,
    revision: draft.revision + 1,
    validatedRevision: undefined,
    validationError: "",
    updatedAt: ctx.timestamp,
  });
}
function upsert<T extends { id: string }>(items: T[], item: T) {
  const i = items.findIndex((v) => v.id === item.id);
  if (i < 0) items.push(item);
  else items[i] = item;
}
export const createGameDraft = db.reducer(
  { requestId: t.string(), title: t.string(), description: t.string() },
  (ctx, a) =>
    run(() =>
      insertDraft(ctx, a.requestId, a.title, a.description, emptyDefinition()),
    ),
);
export const createExampleDraft = db.reducer(
  { requestId: t.string() },
  (ctx, a) =>
    run(() =>
      insertDraft(
        ctx,
        a.requestId,
        "Workshop Duel",
        "A playable example using the supported creation tools.",
        exampleGame(),
      ),
    ),
);
export const updateDesignerDraft = db.reducer(
  {
    ...draftArgs,
    title: t.string(),
    description: t.string(),
    definition: wire.gameDefinition,
    rules: wire.designerRules,
  },
  (ctx, a) =>
    run(() => {
      const draft = ownedDraft(ctx, a.draftId, a.expectedRevision);
      text(a.title, "Game title");
      requireRule(
        a.description.length <= 2000,
        "Description exceeds 2000 characters",
      );
      validateDraftBounds(a.definition);
      requireRule(
        JSON.stringify(a.rules).length <= 50_000,
        "Designer rules exceed 50 KB",
      );
      ctx.db.gameDraft.id.update({
        ...draft,
        title: a.title,
        description: a.description,
        definition: a.definition,
        revision: draft.revision + 1,
        validatedRevision: undefined,
        validationError: "",
        updatedAt: ctx.timestamp,
      });
      const row = { draftId: draft.id, owner: ctx.sender, rules: a.rules };
      if (ctx.db.draftRules.draftId.find(draft.id))
        ctx.db.draftRules.draftId.update(row);
      else ctx.db.draftRules.insert(row);
    }),
);
export const updateGameDraft = db.reducer(
  {
    ...draftArgs,
    title: t.string(),
    description: t.string(),
    definition: wire.gameDefinition,
  },
  (ctx, a) =>
    run(() => {
      const draft = ownedDraft(ctx, a.draftId, a.expectedRevision);
      text(a.title, "Title");
      requireRule(a.description.length <= 2000, "Description is too long");
      validateDraftBounds(a.definition);
      ctx.db.gameDraft.id.update({
        ...draft,
        title: a.title,
        description: a.description,
        definition: a.definition,
        revision: draft.revision + 1,
        validatedRevision: undefined,
        validationError: "",
        updatedAt: ctx.timestamp,
      });
    }),
);
export const createCardFormat = db.reducer(
  { ...draftArgs, format: wire.cardFormat },
  (ctx, a) =>
    run(() =>
      edit(ctx, a.draftId, a.expectedRevision, (g) =>
        upsert(g.formats, a.format),
      ),
    ),
);
export const createParticipantLimits = db.reducer(
  { ...draftArgs, limits: wire.participantLimits },
  (ctx, a) =>
    run(() =>
      edit(ctx, a.draftId, a.expectedRevision, (g) => {
        g.participants = a.limits;
      }),
    ),
);
export const createCardInteraction = db.reducer(
  { ...draftArgs, interaction: wire.action },
  (ctx, a) =>
    run(() =>
      edit(ctx, a.draftId, a.expectedRevision, (g) =>
        upsert(g.actions, a.interaction),
      ),
    ),
);
export const createCardTrigger = db.reducer(
  { ...draftArgs, trigger: wire.trigger },
  (ctx, a) =>
    run(() =>
      edit(ctx, a.draftId, a.expectedRevision, (g) =>
        upsert(g.triggers, a.trigger),
      ),
    ),
);
export const createCard = db.reducer(
  { ...draftArgs, card: wire.cardDefinition },
  (ctx, a) =>
    run(() =>
      edit(ctx, a.draftId, a.expectedRevision, (g) => upsert(g.cards, a.card)),
    ),
);
export const createField = db.reducer(
  { ...draftArgs, field: wire.fieldDefinition },
  (ctx, a) =>
    run(() =>
      edit(ctx, a.draftId, a.expectedRevision, (g) => {
        g.field = a.field;
      }),
    ),
);
export const createSpace = db.reducer(
  { ...draftArgs, space: wire.space },
  (ctx, a) =>
    run(() =>
      edit(ctx, a.draftId, a.expectedRevision, (g) =>
        upsert(g.spaces, a.space),
      ),
    ),
);
export const createConstraint = db.reducer(
  { ...draftArgs, constraint: wire.constraint },
  (ctx, a) =>
    run(() =>
      edit(ctx, a.draftId, a.expectedRevision, (g) =>
        upsert(g.constraints, a.constraint),
      ),
    ),
);
export const addDice = db.reducer({ ...draftArgs, dice: wire.dice }, (ctx, a) =>
  run(() =>
    edit(ctx, a.draftId, a.expectedRevision, (g) => upsert(g.dice, a.dice)),
  ),
);
export const addCoin = db.reducer({ ...draftArgs, coin: wire.coin }, (ctx, a) =>
  run(() =>
    edit(ctx, a.draftId, a.expectedRevision, (g) => upsert(g.coins, a.coin)),
  ),
);
export const createHandSize = db.reducer(
  { ...draftArgs, hand: wire.handSize },
  (ctx, a) =>
    run(() =>
      edit(ctx, a.draftId, a.expectedRevision, (g) => {
        g.hand = a.hand;
      }),
    ),
);
export const createTurnPhases = db.reducer(
  { ...draftArgs, phases: t.array(wire.phase) },
  (ctx, a) =>
    run(() =>
      edit(ctx, a.draftId, a.expectedRevision, (g) => {
        g.phases = a.phases;
      }),
    ),
);
export const createSubPhases = db.reducer(
  { ...draftArgs, phaseId: t.string(), subPhases: t.array(wire.subPhase) },
  (ctx, a) =>
    run(() =>
      edit(ctx, a.draftId, a.expectedRevision, (g) => {
        const phase = g.phases.find((p) => p.id === a.phaseId);
        requireRule(phase, "Unknown phase");
        phase.subPhases = a.subPhases;
      }),
    ),
);
export const createLife = db.reducer(
  { ...draftArgs, startingHealth: t.u32() },
  (ctx, a) =>
    run(() =>
      edit(ctx, a.draftId, a.expectedRevision, (g) => {
        g.startingHealth = a.startingHealth;
      }),
    ),
);
export const createWinCondition = db.reducer(
  { ...draftArgs, victory: t.string() },
  (ctx, a) =>
    run(() => {
      requireRule(
        a.victory === "health",
        "Only health-based victory is supported",
      );
      edit(ctx, a.draftId, a.expectedRevision, (g) => {
        g.victory = a.victory;
      });
    }),
);
export const createDeckRules = db.reducer(
  { ...draftArgs, rules: wire.deckRules },
  (ctx, a) =>
    run(() =>
      edit(ctx, a.draftId, a.expectedRevision, (g) => {
        g.deckRules = a.rules;
      }),
    ),
);
export const createStarterDeck = db.reducer(
  { ...draftArgs, deck: wire.deckRecipe },
  (ctx, a) =>
    run(() =>
      edit(ctx, a.draftId, a.expectedRevision, (g) =>
        upsert(g.starterDecks, a.deck),
      ),
    ),
);
export const createSetup = db.reducer(
  { ...draftArgs, setup: wire.setup },
  (ctx, a) =>
    run(() =>
      edit(ctx, a.draftId, a.expectedRevision, (g) => {
        g.setup = a.setup;
      }),
    ),
);
export const validateGameDraft = db.reducer(draftArgs, (ctx, a) =>
  run(() => {
    const draft = ownedDraft(ctx, a.draftId, a.expectedRevision);
    let validationError = "";
    try {
      validateGame(draft.definition);
      const extra = ctx.db.draftRules.draftId.find(draft.id);
      if (extra) validateDesignerRules(draft.definition, extra.rules);
    } catch (e) {
      validationError = e instanceof Error ? e.message : "Invalid definition";
    }
    ctx.db.gameDraft.id.update({
      ...draft,
      validatedRevision: validationError ? undefined : draft.revision,
      validationError,
      updatedAt: ctx.timestamp,
    });
  }),
);
export const publishGame = db.reducer(
  { ...draftArgs, gameId: t.u64().optional() },
  (ctx, a) =>
    run(() => {
      const draft = ownedDraft(ctx, a.draftId, a.expectedRevision);
      const prior = [...ctx.db.gameVersion.iter()].find(
        (v) => v.draftId === draft.id && v.draftRevision === draft.revision,
      );
      if (prior) {
        requireRule(
          a.gameId === undefined || a.gameId === prior.gameId,
          "Revision already published to another game",
        );
        return;
      }
      requireRule(
        draft.validatedRevision === draft.revision,
        "Validate the current draft before publishing",
      );
      validateGame(draft.definition);
      const extra = ctx.db.draftRules.draftId.find(draft.id);
      if (extra) validateDesignerRules(draft.definition, extra.rules);
      let game =
        a.gameId === undefined
          ? undefined
          : ctx.db.publishedGame.id.find(a.gameId);
      if (a.gameId !== undefined)
        requireRule(
          game?.owner.equals(ctx.sender),
          "Game not found or not owned by you",
        );
      if (!game)
        game = ctx.db.publishedGame.insert({
          id: 0n,
          owner: ctx.sender,
          title: draft.title,
          description: draft.description,
          latestVersionId: 0n,
          createdAt: ctx.timestamp,
        });
      const versions = [...ctx.db.gameVersion.gameId.filter(game.id)];
      const next = ctx.db.gameVersion.insert({
        id: 0n,
        gameId: game.id,
        version: versions.length + 1,
        draftId: draft.id,
        draftRevision: draft.revision,
        definition: draft.definition,
        publishedAt: ctx.timestamp,
      });
      ctx.db.publishedGame.id.update({
        ...game,
        title: draft.title,
        description: draft.description,
        latestVersionId: next.id,
      });
      if (extra)
        ctx.db.versionRules.insert({ versionId: next.id, rules: extra.rules });
    }),
);
