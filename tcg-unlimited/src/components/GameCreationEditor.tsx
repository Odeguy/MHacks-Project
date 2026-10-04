import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useLocalState } from "../preview-data";
import { useGameData, displayCard } from "../GameDataContext";
import { PlayingCard } from "../pages";
import { Icon } from "../ui";
import {
  actionKinds,
  actionNames,
  blankAbility,
  blankEffect,
  changeTypeRole,
  documentFromDefinition,
  newDocument,
  newId,
  resizeField,
  syncDocument,
  type DesignerDocument,
} from "../designer-model";
import type { CardEffect } from "../module_bindings/types";
import "./GameCreationEditor.css";

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 200,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="form-label">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) =>
          onChange(
            Math.max(min, Math.min(max, Math.trunc(Number(e.target.value)))),
          )
        }
      />
    </label>
  );
}
export default function GameCreationEditor() {
  const data = useGameData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const loadedQuery = useRef("");
  const [initial] = useState(newDocument);
  const [doc, setDoc] = useLocalState<DesignerDocument>(
    "tcg:designer:v2",
    initial,
  );
  const [tab, setTab] = useState("General");
  const [draftId, setDraftId] = useState<bigint>();
  const [revision, setRevision] = useState<number>();
  const [selectedCard, setSelectedCard] = useState(
    doc.definition.cards[0]?.id ?? "",
  );
  const [paintType, setPaintType] = useState(doc.rules.slotTypes[0]?.id ?? "");
  const game = doc.definition,
    rules = doc.rules;
  const card = game.cards.find((c) => c.id === selectedCard) ?? game.cards[0];
  const editorDrafts = data.drafts;
  const load = (id: string) => {
    const draft = editorDrafts.find((d) => String(d.id) === id);
    if (!draft) {
      setDraftId(undefined);
      setRevision(undefined);
      loadedQuery.current = "";
      setParams({}, { replace: true });
      return;
    }
    const next = documentFromDefinition(
      draft.title,
      draft.description,
      draft.definition,
      data.draftRuleRows.find((row) => row.draftId === draft.id)?.rules,
    );
    setDoc(next);
    setDraftId(draft.id);
    setRevision(draft.revision);
    setSelectedCard(next.definition.cards[0]?.id ?? "");
    setPaintType(next.rules.slotTypes[0]?.id ?? "");
    loadedQuery.current = id;
    setParams({ draft: id }, { replace: true });
  };
  useEffect(() => {
    const id = params.get("draft");
    if (
      id &&
      data.ready &&
      loadedQuery.current !== id &&
      editorDrafts.some((d) => String(d.id) === id)
    ) {
      load(id);
      loadedQuery.current = id;
    }
  }, [params, data.ready, data.drafts, data.draftRuleRows]);
  const edit = (change: (draft: DesignerDocument) => void) =>
    setDoc((old) => {
      const next = structuredClone(old);
      change(next);
      return syncDocument(next);
    });
  const save = async () => {
    const saved = await data.saveDesignerDocument(
      syncDocument(doc),
      draftId,
      revision,
    );
    if (saved) {
      setDraftId(saved.id);
      setRevision(saved.revision);
      loadedQuery.current = String(saved.id);
      setParams({ draft: String(saved.id) }, { replace: true });
    }
  };
  const addCard = () => {
    const id = newId("card"),
      format = game.formats[0];
    if (!format) return;
    edit((d) => {
      d.definition.cards.push({
        id,
        name: "New card",
        formatId: format.id,
        actionIds: [],
        triggerIds: [],
        values: format.fields.map((f) => ({
          key: f.key,
          numberValue: f.kind === "number" ? 0 : undefined,
          textValue: f.kind === "text" ? "" : undefined,
        })),
      });
      d.rules.cardSlots.push({
        cardId: id,
        allowedTypeIds: d.rules.slotTypes.map((t) => t.id),
      });
      d.definition.starterDecks = [];
    });
    setSelectedCard(id);
  };
  const ability =
    card &&
    game.actions.find(
      (a) => card.actionIds.includes(a.id) && a.kind === "activate",
    );
  const changeAbility = (
    change: (action: NonNullable<typeof ability>) => void,
  ) =>
    edit((d) => {
      const target = d.definition.cards.find((c) => c.id === card!.id)!;
      let action = d.definition.actions.find(
        (a) => target.actionIds.includes(a.id) && a.kind === "activate",
      );
      if (!action) {
        action = blankAbility(target.id);
        d.definition.actions.push(action);
        target.actionIds.push(action.id);
      }
      change(action);
    });
  const changeEffect = (index: number, changes: Partial<CardEffect>) =>
    changeAbility((action) => {
      Object.assign(action.effects[index], changes);
    });
  const role = rules.typeRoles.find((t) => t.formatId === card?.formatId)?.role;
  const paint = (slotId: string) =>
    edit((d) => {
      d.rules.slots.find((s) => s.slotId === slotId)!.typeId =
        rules.slotTypes.some((t) => t.id === paintType)
          ? paintType
          : rules.slotTypes[0].id;
    });

  return (
    <>
      <div className="editor-heading">
        <h1>Create game</h1>
      </div>
      <div className="creation-layout">
        <section className="panel creation-workspace">
          <div className="creation-draft-picker">
            <label className="form-label">
              Saved drafts
              <select
                aria-label="Saved drafts"
                value={String(draftId ?? "")}
                disabled={!data.ready || data.pending}
                onChange={(e) => load(e.target.value)}
              >
                <option value="">Unsaved workspace</option>
                {editorDrafts.map((d) => (
                  <option key={String(d.id)} value={String(d.id)}>
                    {d.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button-outline"
              onClick={() => {
                const next = newDocument();
                setDoc(next);
                setDraftId(undefined);
                setRevision(undefined);
                loadedQuery.current = "";
                setParams({}, { replace: true });
                setSelectedCard(next.definition.cards[0].id);
                setPaintType(next.rules.slotTypes[0].id);
              }}
            >
              New game
            </button>
          </div>
          <div className="filter-tabs creation-tabs">
            {["General", "Card types", "Cards", "Phases", "Field"].map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "General" && (
            <>
              <label className="form-label">
                Game title
                <input
                  maxLength={80}
                  value={doc.name}
                  onChange={(e) =>
                    edit((d) => {
                      d.name = e.target.value;
                    })
                  }
                />
              </label>
              <label className="form-label">
                Description
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={doc.prompt}
                  onChange={(e) =>
                    edit((d) => {
                      d.prompt = e.target.value;
                    })
                  }
                />
              </label>
              <div className="form-grid">
                <NumberField
                  label="Starting health"
                  value={game.startingHealth}
                  min={1}
                  max={1000000}
                  onChange={(v) =>
                    edit((d) => {
                      d.definition.startingHealth = v;
                    })
                  }
                />
                <label className="form-label">
                  Health name
                  <input
                    maxLength={32}
                    value={rules.healthName}
                    onChange={(e) =>
                      edit((d) => {
                        d.rules.healthName = e.target.value;
                      })
                    }
                  />
                </label>
                <NumberField
                  label="Starting hand size"
                  value={game.hand.initial}
                  max={game.hand.maximum}
                  onChange={(v) =>
                    edit((d) => {
                      d.definition.hand.initial = v;
                    })
                  }
                />
                <NumberField
                  label="Max hand size"
                  value={game.hand.maximum}
                  min={1}
                  onChange={(v) =>
                    edit((d) => {
                      d.definition.hand.maximum = v;
                      d.definition.hand.initial = Math.min(
                        v,
                        d.definition.hand.initial,
                      );
                    })
                  }
                />
                <NumberField
                  label="Draws per turn"
                  value={game.setup.turnDraw}
                  onChange={(v) =>
                    edit((d) => {
                      d.definition.setup.turnDraw = v;
                    })
                  }
                />
                <NumberField
                  label="Plays per turn"
                  value={rules.playsPerTurn}
                  onChange={(v) =>
                    edit((d) => {
                      d.rules.playsPerTurn = v;
                    })
                  }
                />
                <NumberField
                  label="Minimum players"
                  value={game.participants.minimum}
                  min={2}
                  max={8}
                  onChange={(v) =>
                    edit((d) => {
                      d.definition.participants.minimum = v;
                      d.definition.participants.maximum = Math.max(
                        v,
                        d.definition.participants.maximum,
                      );
                    })
                  }
                />
                <NumberField
                  label="Maximum players"
                  value={game.participants.maximum}
                  min={game.participants.minimum}
                  max={8}
                  onChange={(v) =>
                    edit((d) => {
                      d.definition.participants.maximum = v;
                    })
                  }
                />
                <NumberField
                  label="Minimum deck size"
                  value={game.deckRules.minSize}
                  min={1}
                  onChange={(v) =>
                    edit((d) => {
                      d.definition.deckRules.minSize = v;
                      d.definition.deckRules.maxSize = Math.max(
                        v,
                        d.definition.deckRules.maxSize,
                      );
                      d.definition.starterDecks = [];
                    })
                  }
                />
                <NumberField
                  label="Maximum deck size"
                  value={game.deckRules.maxSize}
                  min={game.deckRules.minSize}
                  onChange={(v) =>
                    edit((d) => {
                      d.definition.deckRules.maxSize = v;
                      d.definition.starterDecks = [];
                    })
                  }
                />
              </div>
              <div className="creation-checks">
                {["dice", "coin"].map((kind) => (
                  <label key={kind}>
                    <input
                      type="checkbox"
                      checked={
                        kind === "dice"
                          ? game.dice.length > 0
                          : game.coins.length > 0
                      }
                      onChange={(e) =>
                        edit((d) => {
                          if (kind === "dice")
                            d.definition.dice = e.target.checked
                              ? [{ id: "d6", count: 1, sides: 6 }]
                              : [];
                          else
                            d.definition.coins = e.target.checked
                              ? [{ id: "coin", outcomes: ["heads", "tails"] }]
                              : [];
                        })
                      }
                    />
                    Include {kind}
                  </label>
                ))}
              </div>
            </>
          )}

          {tab === "Card types" && (
            <>
              <h2>Card types</h2>
              {game.formats.map((format) => (
                <div className="creation-type-row" key={format.id}>
                  <label className="form-label">
                    Type name
                    <input
                      maxLength={64}
                      value={format.name}
                      onChange={(e) =>
                        edit((d) => {
                          d.definition.formats.find(
                            (f) => f.id === format.id,
                          )!.name = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label className="form-label">
                    Role
                    <select
                      value={
                        rules.typeRoles.find((t) => t.formatId === format.id)
                          ?.role ?? "fighter"
                      }
                      onChange={(e) =>
                        setDoc(
                          syncDocument(
                            changeTypeRole(doc, format.id, e.target.value),
                          ),
                        )
                      }
                    >
                      <option value="fighter">Fighter</option>
                      <option value="effect">Effect card</option>
                    </select>
                  </label>
                  <button
                    className="text-button"
                    disabled={
                      game.formats.length === 1 ||
                      game.cards.some((c) => c.formatId === format.id)
                    }
                    onClick={() =>
                      edit((d) => {
                        d.definition.formats = d.definition.formats.filter(
                          (f) => f.id !== format.id,
                        );
                        d.rules.typeRoles = d.rules.typeRoles.filter(
                          (t) => t.formatId !== format.id,
                        );
                        d.definition.deckRules.allowedFormatIds =
                          d.definition.deckRules.allowedFormatIds.filter(
                            (id) => id !== format.id,
                          );
                        for (const phase of d.rules.phases)
                          phase.steps = phase.steps.filter(
                            (s) => s.formatId !== format.id,
                          );
                      })
                    }
                  >
                    Remove type
                  </button>
                </div>
              ))}
              <button
                className="button button-outline"
                disabled={game.formats.length >= 16}
                onClick={() => {
                  const id = newId("type");
                  edit((d) => {
                    d.definition.formats.push({
                      id,
                      name: "New type",
                      fields: [
                        { key: "atk", label: "Attack", kind: "number" },
                        { key: "def", label: "Defense", kind: "number" },
                        { key: "text", label: "Description", kind: "text" },
                      ],
                      buttons: d.definition.actions
                        .filter((a) => ["play", "attack"].includes(a.kind))
                        .map((a) => a.id),
                    });
                    d.rules.typeRoles.push({ formatId: id, role: "fighter" });
                    d.definition.deckRules.allowedFormatIds.push(id);
                  });
                }}
              >
                <Icon name="plus" />
                Add card type
              </button>
              <p className="quiet-note">
                Fighters have attack and defense. Effect cards use their
                configured effects. Types in use cannot be removed.
              </p>
            </>
          )}

          {tab === "Cards" && (
            <>
              <div className="creation-card-picker">
                <label className="form-label">
                  Card
                  <select
                    aria-label="Edit card"
                    value={card?.id ?? ""}
                    onChange={(e) => setSelectedCard(e.target.value)}
                  >
                    {game.cards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button button-outline"
                  onClick={addCard}
                  disabled={game.cards.length >= 48}
                >
                  <Icon name="plus" />
                  Create card
                </button>
              </div>
              {card && (
                <>
                  <div className="form-grid">
                    <label className="form-label">
                      Card name
                      <input
                        value={card.name}
                        maxLength={80}
                        onChange={(e) =>
                          edit((d) => {
                            d.definition.cards.find(
                              (c) => c.id === card.id,
                            )!.name = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label className="form-label">
                      Card type
                      <select
                        value={card.formatId}
                        onChange={(e) =>
                          edit((d) => {
                            const c = d.definition.cards.find(
                                (c) => c.id === card.id,
                              )!,
                              f = d.definition.formats.find(
                                (f) => f.id === e.target.value,
                              )!;
                            c.formatId = f.id;
                            c.values = f.fields.map(
                              (field) =>
                                c.values.find((v) => v.key === field.key) ?? {
                                  key: field.key,
                                  numberValue:
                                    field.kind === "number" ? 0 : undefined,
                                  textValue:
                                    field.kind === "text" ? "" : undefined,
                                },
                            );
                          })
                        }
                      >
                        {game.formats.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <NumberField
                      label="Limit per deck"
                      value={
                        game.deckRules.copyLimits.find(
                          (c) => c.cardId === card.id,
                        )?.maximum ?? game.deckRules.maxCopies
                      }
                      onChange={(v) =>
                        edit((d) => {
                          const limit = d.definition.deckRules.copyLimits.find(
                            (c) => c.cardId === card.id,
                          );
                          if (limit) limit.maximum = v;
                          else
                            d.definition.deckRules.copyLimits.push({
                              cardId: card.id,
                              maximum: v,
                            });
                          d.definition.starterDecks = [];
                        })
                      }
                    />
                    {card.values
                      .filter((v) => v.numberValue !== undefined)
                      .map((value) => (
                        <NumberField
                          key={value.key}
                          label={
                            game.formats
                              .find((f) => f.id === card.formatId)!
                              .fields.find((f) => f.key === value.key)!.label
                          }
                          value={value.numberValue!}
                          max={1000000}
                          onChange={(v) =>
                            edit((d) => {
                              d.definition.cards
                                .find((c) => c.id === card.id)!
                                .values.find(
                                  (x) => x.key === value.key,
                                )!.numberValue = v;
                            })
                          }
                        />
                      ))}
                  </div>
                  <label className="form-label">
                    Card description
                    <textarea
                      rows={2}
                      maxLength={2000}
                      value={
                        card.values.find((v) => v.key === "text")?.textValue ??
                        ""
                      }
                      onChange={(e) =>
                        edit((d) => {
                          const value = d.definition.cards
                            .find((c) => c.id === card.id)!
                            .values.find((v) => v.key === "text");
                          if (value) value.textValue = e.target.value;
                        })
                      }
                    />
                  </label>
                  <fieldset className="creation-section">
                    <legend>Allowed slot types</legend>
                    <div className="creation-checks">
                      {rules.slotTypes.map((type) => (
                        <label key={type.id}>
                          <input
                            type="checkbox"
                            checked={
                              rules.cardSlots
                                .find((c) => c.cardId === card.id)
                                ?.allowedTypeIds.includes(type.id) ?? false
                            }
                            onChange={(e) =>
                              edit((d) => {
                                const permission = d.rules.cardSlots.find(
                                  (c) => c.cardId === card.id,
                                )!;
                                permission.allowedTypeIds = e.target.checked
                                  ? [...permission.allowedTypeIds, type.id]
                                  : permission.allowedTypeIds.filter(
                                      (id) => id !== type.id,
                                    );
                              })
                            }
                          />
                          {type.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="creation-section">
                    <legend>
                      {role === "fighter"
                        ? "Fighter effect"
                        : "Effect card effect"}
                    </legend>
                    {!ability ? (
                      <button
                        className="button button-outline"
                        onClick={() => changeAbility(() => {})}
                      >
                        Add effect
                      </button>
                    ) : (
                      <>
                        <label className="form-label">
                          Effect target
                          <select
                            value={ability.targetKind}
                            onChange={(e) =>
                              changeAbility((a) => {
                                a.targetKind = e.target.value;
                                for (const effect of a.effects)
                                  if (
                                    ["target_card", "target_player"].includes(
                                      effect.target,
                                    )
                                  )
                                    effect.target =
                                      a.targetKind.endsWith("_card") &&
                                      [
                                        "damage",
                                        "change_stat",
                                        "discard",
                                      ].includes(effect.kind)
                                        ? "target_card"
                                        : ["change_stat", "discard"].includes(
                                              effect.kind,
                                            )
                                          ? "source_card"
                                          : a.targetKind === "opponent"
                                            ? "target_player"
                                            : "actor";
                              })
                            }
                          >
                            <option value="self">Yourself</option>
                            <option value="opponent">Opponent</option>
                            <option value="own_card">Your field card</option>
                            <option value="enemy_card">Enemy field card</option>
                          </select>
                        </label>
                        <label className="creation-checkbox">
                          <input
                            type="checkbox"
                            checked={ability.oncePerTurn}
                            onChange={(e) =>
                              changeAbility((a) => {
                                a.oncePerTurn = e.target.checked;
                              })
                            }
                          />
                          Effect once per card each turn
                        </label>
                        {ability.effects.map((effect, i) => {
                          const cardTarget =
                            ability.targetKind.endsWith("_card");
                          const targets = ["discard", "change_stat"].includes(
                            effect.kind,
                          )
                            ? [
                                "source_card",
                                ...(cardTarget ? ["target_card"] : []),
                              ]
                            : effect.kind === "damage"
                              ? [
                                  "actor",
                                  "source_card",
                                  ...(cardTarget
                                    ? ["target_card"]
                                    : ability.targetKind === "opponent"
                                      ? ["target_player"]
                                      : []),
                                ]
                              : [
                                  "actor",
                                  ...(ability.targetKind === "opponent"
                                    ? ["target_player"]
                                    : []),
                                ];
                          return (
                            <div className="creation-effect-row" key={i}>
                              <label className="form-label">
                                Effect {i + 1}
                                <select
                                  value={effect.kind}
                                  onChange={(e) =>
                                    changeEffect(i, {
                                      ...blankEffect(e.target.value),
                                      target: [
                                        "discard",
                                        "change_stat",
                                      ].includes(e.target.value)
                                        ? "source_card"
                                        : e.target.value === "damage" &&
                                            ability.targetKind === "opponent"
                                          ? "target_player"
                                          : "actor",
                                      statKey:
                                        e.target.value === "change_stat"
                                          ? "atk"
                                          : "",
                                    })
                                  }
                                >
                                  {[
                                    ["damage", "Damage"],
                                    ["heal", "Heal"],
                                    ["draw", "Draw"],
                                    ["gain_resource", "Gain resource"],
                                    ["change_stat", "Change stat"],
                                    ["discard", "Discard"],
                                  ].map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="form-label">
                                Apply to
                                <select
                                  value={effect.target}
                                  onChange={(e) =>
                                    changeEffect(i, { target: e.target.value })
                                  }
                                >
                                  {targets.map((target) => (
                                    <option key={target} value={target}>
                                      {
                                        (
                                          {
                                            actor: "You",
                                            source_card: "This card",
                                            target_card: "Target card",
                                            target_player: "Target player",
                                          } as Record<string, string>
                                        )[target]
                                      }
                                    </option>
                                  ))}
                                </select>
                              </label>
                              {effect.kind !== "discard" && (
                                <NumberField
                                  label={`Amount ${i + 1}`}
                                  value={effect.amount}
                                  min={
                                    effect.kind === "change_stat" ? -1000000 : 0
                                  }
                                  max={effect.kind === "draw" ? 200 : 1000000}
                                  onChange={(v) =>
                                    changeEffect(i, { amount: v })
                                  }
                                />
                              )}
                              {effect.kind === "change_stat" && (
                                <label className="form-label">
                                  Stat
                                  <select
                                    value={effect.statKey}
                                    onChange={(e) =>
                                      changeEffect(i, {
                                        statKey: e.target.value,
                                      })
                                    }
                                  >
                                    <option value="atk">Attack</option>
                                    <option value="def">Defense</option>
                                  </select>
                                </label>
                              )}
                              <button
                                className="text-button"
                                aria-label={`Remove effect ${i + 1}`}
                                onClick={() =>
                                  changeAbility((a) => {
                                    a.effects.splice(i, 1);
                                  })
                                }
                              >
                                Remove
                              </button>
                            </div>
                          );
                        })}
                        <div className="creation-row-actions">
                          <button
                            className="button button-outline"
                            disabled={ability.effects.length >= 8}
                            onClick={() =>
                              changeAbility((a) => {
                                a.effects.push({
                                  ...blankEffect("heal"),
                                  target: "actor",
                                });
                              })
                            }
                          >
                            Add effect step
                          </button>
                          <button
                            className="text-button"
                            onClick={() =>
                              edit((d) => {
                                d.definition.cards.find(
                                  (c) => c.id === card.id,
                                )!.actionIds = card.actionIds.filter(
                                  (id) => id !== ability.id,
                                );
                                d.definition.actions =
                                  d.definition.actions.filter(
                                    (a) => a.id !== ability.id,
                                  );
                              })
                            }
                          >
                            Remove ability
                          </button>
                        </div>
                        <p className="quiet-note">
                          Place the card in an allowed slot, then activate its
                          effect. Effects resolve from top to bottom.
                        </p>
                      </>
                    )}
                  </fieldset>
                  <button
                    className="text-button"
                    disabled={game.cards.length === 1}
                    onClick={() =>
                      edit((d) => {
                        d.definition.cards = d.definition.cards.filter(
                          (c) => c.id !== card.id,
                        );
                        d.rules.cardSlots = d.rules.cardSlots.filter(
                          (c) => c.cardId !== card.id,
                        );
                        d.definition.deckRules.copyLimits =
                          d.definition.deckRules.copyLimits.filter(
                            (c) => c.cardId !== card.id,
                          );
                        d.definition.starterDecks = [];
                        d.definition.actions = d.definition.actions.filter(
                          (a) =>
                            !card.actionIds.includes(a.id) ||
                            d.definition.cards.some((c) =>
                              c.actionIds.includes(a.id),
                            ) ||
                            d.definition.formats.some((f) =>
                              f.buttons.includes(a.id),
                            ),
                        );
                      })
                    }
                  >
                    Delete card
                  </button>
                </>
              )}
            </>
          )}

          {tab === "Phases" && (
            <>
              <h2>Turn phases</h2>
              <p className="quiet-note">
                Phases run from top to bottom. Limits apply per player, per
                phase; attacks against cards and players share the attack limit.
              </p>
              {game.phases.map((phase, pIndex) => {
                const config = rules.phases.find(
                  (p) => p.phaseId === phase.id,
                )!;
                const movePhase = (delta: number) =>
                  edit((d) => {
                    const [p] = d.definition.phases.splice(pIndex, 1);
                    d.definition.phases.splice(pIndex + delta, 0, p);
                  });
                return (
                  <fieldset className="creation-section" key={phase.id}>
                    <legend>Phase {pIndex + 1}</legend>
                    <div className="creation-phase-heading">
                      <label className="form-label">
                        Phase name
                        <input
                          maxLength={64}
                          value={phase.name}
                          onChange={(e) =>
                            edit((d) => {
                              d.definition.phases.find(
                                (p) => p.id === phase.id,
                              )!.name = e.target.value;
                            })
                          }
                        />
                      </label>
                      <button
                        className="icon-button"
                        aria-label={`Move ${phase.name} earlier`}
                        disabled={pIndex === 0}
                        onClick={() => movePhase(-1)}
                      >
                        ↑
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Move ${phase.name} later`}
                        disabled={pIndex === game.phases.length - 1}
                        onClick={() => movePhase(1)}
                      >
                        ↓
                      </button>
                      <button
                        className="text-button"
                        disabled={game.phases.length === 1}
                        onClick={() =>
                          edit((d) => {
                            d.definition.phases = d.definition.phases.filter(
                              (p) => p.id !== phase.id,
                            );
                            d.rules.phases = d.rules.phases.filter(
                              (p) => p.phaseId !== phase.id,
                            );
                          })
                        }
                      >
                        Remove phase
                      </button>
                    </div>
                    <label className="creation-checkbox">
                      <input
                        type="checkbox"
                        checked={config.ordered}
                        onChange={(e) =>
                          edit((d) => {
                            d.rules.phases.find(
                              (p) => p.phaseId === phase.id,
                            )!.ordered = e.target.checked;
                          })
                        }
                      />
                      Ordered actions (you can skip forward)
                    </label>
                    {config.steps.map((step, index) => {
                      const changeStep = (patch: Partial<typeof step>) =>
                        edit((d) => {
                          Object.assign(
                            d.rules.phases.find((p) => p.phaseId === phase.id)!
                              .steps[index],
                            patch,
                          );
                        });
                      const move = (delta: number) =>
                        edit((d) => {
                          const steps = d.rules.phases.find(
                            (p) => p.phaseId === phase.id,
                          )!.steps;
                          const [s] = steps.splice(index, 1);
                          steps.splice(index + delta, 0, s);
                        });
                      return (
                        <div className="creation-step-row" key={step.id}>
                          <label className="form-label">
                            Action {index + 1}
                            <select
                              value={step.kind}
                              aria-label={`Action for ${phase.name} step ${index + 1}`}
                              onChange={(e) =>
                                changeStep({
                                  kind: e.target.value,
                                  formatId: "",
                                })
                              }
                            >
                              {actionKinds
                                .filter(
                                  (kind) => kind !== "roll" || game.dice.length,
                                )
                                .filter(
                                  (kind) =>
                                    kind !== "flip" || game.coins.length,
                                )
                                .map((kind) => (
                                  <option key={kind} value={kind}>
                                    {actionNames[kind]}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label className="form-label">
                            Card type
                            <select
                              value={step.formatId}
                              disabled={
                                !["play", "activate", "attack"].includes(
                                  step.kind,
                                )
                              }
                              onChange={(e) =>
                                changeStep({ formatId: e.target.value })
                              }
                            >
                              <option value="">All types</option>
                              {game.formats.map((type) => (
                                <option key={type.id} value={type.id}>
                                  {type.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <NumberField
                            label={`Limit for ${phase.name} step ${index + 1}`}
                            value={step.maximum}
                            onChange={(v) => changeStep({ maximum: v })}
                          />
                          <div className="creation-step-buttons">
                            <button
                              className="icon-button"
                              aria-label={`Move ${phase.name} action ${index + 1} earlier`}
                              disabled={index === 0}
                              onClick={() => move(-1)}
                            >
                              ↑
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Move ${phase.name} action ${index + 1} later`}
                              disabled={index === config.steps.length - 1}
                              onClick={() => move(1)}
                            >
                              ↓
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Remove ${phase.name} action ${index + 1}`}
                              onClick={() =>
                                edit((d) => {
                                  d.rules.phases
                                    .find((p) => p.phaseId === phase.id)!
                                    .steps.splice(index, 1);
                                })
                              }
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <button
                      className="button button-outline"
                      disabled={config.steps.length >= 32}
                      onClick={() =>
                        edit((d) => {
                          d.rules.phases
                            .find((p) => p.phaseId === phase.id)!
                            .steps.push({
                              id: newId("step"),
                              kind: "play",
                              formatId: "",
                              maximum: 1,
                            });
                        })
                      }
                    >
                      Add action
                    </button>
                    {phase.subPhases.map((sub, index) => (
                      <div className="creation-subphase" key={sub.id}>
                        <label className="form-label">
                          Sub-phase {index + 1}
                          <input
                            value={sub.name}
                            maxLength={64}
                            onChange={(e) =>
                              edit((d) => {
                                d.definition.phases.find(
                                  (p) => p.id === phase.id,
                                )!.subPhases[index].name = e.target.value;
                              })
                            }
                          />
                        </label>
                        <div className="creation-checks">
                          {actionKinds
                            .filter((kind) =>
                              config.steps.some((step) => step.kind === kind),
                            )
                            .map((kind) => (
                              <label key={kind}>
                                <input
                                  type="checkbox"
                                  checked={sub.allowedActionIds.some(
                                    (id) =>
                                      game.actions.find((a) => a.id === id)
                                        ?.kind === kind,
                                  )}
                                  onChange={(e) =>
                                    edit((d) => {
                                      const target = d.definition.phases.find(
                                        (p) => p.id === phase.id,
                                      )!.subPhases[index];
                                      target.allowedActionIds =
                                        target.allowedActionIds.filter(
                                          (id) =>
                                            d.definition.actions.find(
                                              (a) => a.id === id,
                                            )?.kind !== kind,
                                        );
                                      if (e.target.checked)
                                        target.allowedActionIds.push(
                                          ...d.definition.actions
                                            .filter((a) => a.kind === kind)
                                            .map((a) => a.id),
                                        );
                                    })
                                  }
                                />
                                {actionNames[kind]}
                              </label>
                            ))}
                        </div>
                        <button
                          className="text-button"
                          onClick={() =>
                            edit((d) => {
                              d.definition.phases
                                .find((p) => p.id === phase.id)!
                                .subPhases.splice(index, 1);
                            })
                          }
                        >
                          Remove sub-phase
                        </button>
                      </div>
                    ))}
                    <button
                      className="text-button"
                      disabled={phase.subPhases.length >= 16}
                      onClick={() =>
                        edit((d) => {
                          d.definition.phases
                            .find((p) => p.id === phase.id)!
                            .subPhases.push({
                              id: newId("sub"),
                              name: "New sub-phase",
                              allowedActionIds: phase.allowedActionIds,
                            });
                        })
                      }
                    >
                      Add sub-phase
                    </button>
                  </fieldset>
                );
              })}
              <button
                className="button button-outline"
                disabled={game.phases.length >= 16}
                onClick={() =>
                  edit((d) => {
                    const id = newId("phase");
                    d.definition.phases.push({
                      id,
                      name: "New phase",
                      allowedActionIds: [],
                      subPhases: [],
                    });
                    d.rules.phases.push({
                      phaseId: id,
                      ordered: false,
                      steps: [],
                    });
                  })
                }
              >
                Add phase
              </button>
            </>
          )}

          {tab === "Field" && (
            <>
              <h2>Field</h2>
              <p className="quiet-note">
                Each player gets this layout. Hands stay separate. Choose a slot
                type, then click spaces to assign it.
              </p>
              <div className="form-grid">
                <NumberField
                  label="Rows per side"
                  value={game.field.rows}
                  min={1}
                  max={12}
                  onChange={(v) =>
                    setDoc(
                      syncDocument(resizeField(doc, v, game.field.columns)),
                    )
                  }
                />
                <NumberField
                  label="Columns"
                  value={game.field.columns}
                  min={1}
                  max={12}
                  onChange={(v) =>
                    setDoc(syncDocument(resizeField(doc, game.field.rows, v)))
                  }
                />
              </div>
              {rules.slotTypes.map((type) => (
                <div className="creation-type-row" key={type.id}>
                  <label className="form-label">
                    Slot type name
                    <input
                      value={type.name}
                      maxLength={64}
                      onChange={(e) =>
                        edit((d) => {
                          d.rules.slotTypes.find(
                            (t) => t.id === type.id,
                          )!.name = e.target.value;
                        })
                      }
                    />
                  </label>
                  <button
                    className="text-button"
                    disabled={
                      rules.slotTypes.length === 1 ||
                      rules.slots.some((s) => s.typeId === type.id) ||
                      rules.cardSlots.some((c) =>
                        c.allowedTypeIds.includes(type.id),
                      )
                    }
                    onClick={() =>
                      edit((d) => {
                        d.rules.slotTypes = d.rules.slotTypes.filter(
                          (t) => t.id !== type.id,
                        );
                      })
                    }
                  >
                    Remove slot type
                  </button>
                </div>
              ))}
              <button
                className="button button-outline"
                disabled={rules.slotTypes.length >= 32}
                onClick={() =>
                  edit((d) => {
                    d.rules.slotTypes.push({
                      id: newId("slot_type"),
                      name: "New slot type",
                    });
                  })
                }
              >
                Add slot type
              </button>
              <label className="form-label">
                Paint slot type
                <select
                  value={
                    rules.slotTypes.some((t) => t.id === paintType)
                      ? paintType
                      : rules.slotTypes[0]?.id
                  }
                  onChange={(e) => setPaintType(e.target.value)}
                >
                  {rules.slotTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="creation-field-preview">
                {Array.from(
                  { length: game.participants.maximum },
                  (_, seat) => (
                    <section
                      className={`creation-side creation-side-${seat % 4}`}
                      key={seat}
                    >
                      <h3>Player {seat + 1}</h3>
                      <div
                        className="creation-slots"
                        style={{
                          gridTemplateColumns: `repeat(${game.field.columns}, minmax(0, 1fr))`,
                        }}
                      >
                        {Array.from(
                          { length: game.field.rows * game.field.columns },
                          (_, i) => {
                            const slot = game.field.slots.find(
                              (s) =>
                                s.row === Math.floor(i / game.field.columns) &&
                                s.column === i % game.field.columns,
                            );
                            const type = rules.slotTypes.find(
                              (t) =>
                                t.id ===
                                rules.slots.find((s) => s.slotId === slot?.id)
                                  ?.typeId,
                            );
                            return slot ? (
                              <button
                                key={slot.id}
                                aria-label={`Assign row ${slot.row + 1} column ${slot.column + 1} for player ${seat + 1}`}
                                onClick={() => paint(slot.id)}
                              >
                                <b>{type?.name}</b>
                                <small>
                                  {slot.row + 1} / {slot.column + 1}
                                </small>
                              </button>
                            ) : (
                              <div key={i} />
                            );
                          },
                        )}
                      </div>
                    </section>
                  ),
                )}
              </div>
            </>
          )}
        </section>
        <aside className="creation-aside">
          <div className="panel">
            <h2>{doc.name || "Untitled game"}</h2>
            <p>
              {game.startingHealth} {rules.healthName} · {game.cards.length}{" "}
              cards
            </p>
            <p>
              {game.hand.initial} in hand · {game.setup.turnDraw} drawn/turn ·{" "}
              {rules.playsPerTurn} plays/turn
            </p>
            <div className="creation-card-preview">
              {card && <PlayingCard card={displayCard(0n, game, card.id)} />}
            </div>
            <p className="quiet-note">Unsaved edits stay in this browser.</p>
            <button
              className="button button-outline full-width"
              disabled={!data.ready || data.pending}
              onClick={() => void save()}
            >
              Save draft
              <Icon name="check" />
            </button>
            <button
              className="button button-light full-width"
              disabled={!data.ready || data.pending}
              onClick={async () => {
                const id = await data.publishDesignerDocument(
                  syncDocument(doc),
                  draftId,
                  revision,
                );
                if (id) navigate(`/games/${id}`);
              }}
            >
              Publish game
              <Icon name="arrow" />
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
