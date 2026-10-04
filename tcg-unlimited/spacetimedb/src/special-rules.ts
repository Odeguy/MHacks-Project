import type { DesignerRules, GameDefinition, SpecialRules } from "./contracts";
import { bounded, requireRule } from "./validation";
import { fieldModifierKinds } from "./field-effects";

export function validateSpecialRules(
  game: GameDefinition,
  designer: DesignerRules,
  special: SpecialRules,
) {
  const formatOf = (id: string) =>
    designer.typeRoles.find(
      (t) => t.formatId === game.cards.find((c) => c.id === id)?.formatId,
    )?.role;
  for (const rows of [special.reactions, special.fields])
    requireRule(
      rows.length <= 48 &&
        new Set(rows.map((r) => r.cardId)).size === rows.length,
      "Duplicate or excessive special card rules",
    );
  for (const rule of special.reactions) {
    requireRule(
      formatOf(rule.cardId) === "trap_reaction",
      "Reaction rules require Trap/Reaction cards",
    );
    requireRule(
      rule.onActions.length > 0 &&
        rule.onActions.length <= 6 &&
        new Set(rule.onActions).size === rule.onActions.length &&
        rule.onActions.every((kind) =>
          ["play", "activate", "attack", "draw", "roll", "flip"].includes(kind),
        ),
      "Choose valid reaction events",
    );
    const card = game.cards.find((c) => c.id === rule.cardId)!;
    const format = game.formats.find((f) => f.id === card.formatId)!;
    requireRule(
      game.actions.some(
        (a) =>
          a.kind === "activate" &&
          [...card.actionIds, ...format.buttons].includes(a.id),
      ),
      `${card.name} needs a reaction effect`,
    );
  }
  for (const rule of special.fields) {
    requireRule(
      formatOf(rule.cardId) === "field_effect",
      "Field rules require Field Effect cards",
    );
    requireRule(
      rule.modifiers.length > 0 && rule.modifiers.length <= 8,
      "Set one to eight field modifiers",
    );
    for (const modifier of rule.modifiers) {
      bounded(modifier.amount, -200, 200, "Field modifier");
      requireRule(
        fieldModifierKinds.some((m) => m.id === modifier.kind),
        "Unknown field rule",
      );
      requireRule(
        ["all", "owner", "opponents"].includes(modifier.scope),
        "Unknown field rule scope",
      );
      requireRule(
        !modifier.formatId ||
          (["atk", "def", "action_cost"].includes(modifier.kind) &&
            game.formats.some((f) => f.id === modifier.formatId)),
        "Invalid field rule card type",
      );
    }
  }
  for (const card of game.cards) {
    const format = formatOf(card.id);
    if (format === "trap_reaction")
      requireRule(
        special.reactions.some((r) => r.cardId === card.id),
        `Set reaction timing for ${card.name}`,
      );
    if (format === "field_effect")
      requireRule(
        special.fields.some((r) => r.cardId === card.id),
        `Set field rules for ${card.name}`,
      );
  }
}
