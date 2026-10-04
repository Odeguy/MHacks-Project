import {
  actionKinds,
  actionNames,
  type DesignerDocument,
} from "../designer-model";
import { fieldModifierKinds } from "../../spacetimedb/src/field-effects";
import NumberField from "./NumberField";

export default function SpecialCardEditor({
  document,
  cardId,
  presetId,
  edit,
}: {
  document: DesignerDocument;
  cardId: string;
  presetId: string;
  edit: (change: (draft: DesignerDocument) => void) => void;
}) {
  const reaction = document.special?.reactions.find((r) => r.cardId === cardId);
  const field = document.special?.fields.find((r) => r.cardId === cardId);
  if (presetId === "trap_reaction" && reaction)
    return (
      <fieldset className="creation-section">
        <legend>Reaction timing</legend>
        <p className="quiet-note">
          React after an opponent's action resolves, using a placed Trap. Each
          opponent gets one reaction or pass in seat order, with a 30-second
          timeout. Reactions do not open another window.
        </p>
        <div className="creation-checks">
          {actionKinds.map((kind) => (
            <label key={kind}>
              <input
                type="checkbox"
                checked={reaction.onActions.includes(kind)}
                onChange={(e) =>
                  edit((d) => {
                    const rule = d.special.reactions.find(
                      (r) => r.cardId === cardId,
                    )!;
                    rule.onActions = e.target.checked
                      ? [...rule.onActions, kind]
                      : rule.onActions.filter((k) => k !== kind);
                  })
                }
              />
              After {actionNames[kind].toLowerCase()}
            </label>
          ))}
        </div>
        <label className="creation-checkbox">
          <input
            type="checkbox"
            checked={reaction.discardAfterUse}
            onChange={(e) =>
              edit((d) => {
                d.special.reactions.find(
                  (r) => r.cardId === cardId,
                )!.discardAfterUse = e.target.checked;
              })
            }
          />
          Discard Trap after reacting
        </label>
        <p className="quiet-note">
          Configure its reaction effect below. Trap effects cannot be activated
          outside a reaction window.
        </p>
      </fieldset>
    );
  if (presetId === "field_effect" && field)
    return (
      <fieldset className="creation-section">
        <legend>Field-wide rules</legend>
        <p className="quiet-note">
          Active while this card is on the field. Bonuses stack, and disappear
          when it leaves or its owner is eliminated. Negative values reduce the
          setting.
        </p>
        {field.modifiers.map((modifier, index) => (
          <div key={index} className="creation-effect-row">
            <label className="form-label">
              Field rule {index + 1}
              <select
                value={modifier.kind}
                onChange={(e) =>
                  edit((d) => {
                    const m = d.special.fields.find((r) => r.cardId === cardId)!
                      .modifiers[index];
                    m.kind = e.target.value;
                    if (!["atk", "def", "action_cost"].includes(m.kind))
                      m.formatId = "";
                  })
                }
              >
                {fieldModifierKinds.map((kind) => (
                  <option value={kind.id} key={kind.id}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Applies to
              <select
                value={modifier.scope}
                onChange={(e) =>
                  edit((d) => {
                    d.special.fields.find(
                      (r) => r.cardId === cardId,
                    )!.modifiers[index].scope = e.target.value;
                  })
                }
              >
                <option value="all">Everyone</option>
                <option value="owner">Owner</option>
                <option value="opponents">Opponents</option>
              </select>
            </label>
            <NumberField
                label={`Bonus ${index + 1}`}
                min={-200}
                max={200}
                value={modifier.amount}
                onChange={(amount) =>
                  edit((d) => {
                    d.special.fields.find(
                      (r) => r.cardId === cardId,
                    )!.modifiers[index].amount = amount;
                  })
                }
            />
            {["atk", "def", "action_cost"].includes(modifier.kind) && (
              <label className="form-label">
                Affected card type
                <select
                  value={modifier.formatId}
                  onChange={(e) =>
                    edit((d) => {
                      d.special.fields.find(
                        (r) => r.cardId === cardId,
                      )!.modifiers[index].formatId = e.target.value;
                    })
                  }
                >
                  <option value="">All types</option>
                  {document.definition.formats.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              className="text-button"
              aria-label={`Remove field rule ${index + 1}`}
              disabled={field.modifiers.length === 1}
              onClick={() =>
                edit((d) => {
                  d.special.fields
                    .find((r) => r.cardId === cardId)!
                    .modifiers.splice(index, 1);
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          className="button button-outline"
          disabled={field.modifiers.length >= 8}
          onClick={() =>
            edit((d) => {
              d.special.fields
                .find((r) => r.cardId === cardId)!
                .modifiers.push({
                  kind: "def",
                  scope: "all",
                  amount: 1,
                  formatId: "",
                });
            })
          }
        >
          Add field rule
        </button>
      </fieldset>
    );
  return null;
}
