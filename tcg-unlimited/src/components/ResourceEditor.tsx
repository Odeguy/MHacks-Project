import type { DesignerDocument } from "../designer-model";
import { newId } from "../designer-model";
import { resourceCosts } from "../../spacetimedb/src/resources";
import NumberField from "./NumberField";

type Props = {
  document: DesignerDocument;
  edit: (change: (draft: DesignerDocument) => void) => void;
};

export default function ResourceEditor({ document: doc, edit }: Props) {
  const rules = doc.resources;
  return (
    <fieldset className="creation-section">
      <legend>Resources</legend>
      <label className="creation-checkbox">
        <input
          type="checkbox"
          checked={rules.enabled}
          onChange={(e) =>
            edit((d) => {
              d.resources.enabled = e.target.checked;
            })
          }
        />
        Include resources
      </label>
      {rules.enabled && (
        <>
          {rules.pools.map((pool, index) => (
            <div className="creation-resource-pool" key={pool.id}>
              <div className="form-grid">
                <label className="form-label">
                  Resource name
                  <input
                    aria-label={`Resource name ${index + 1}`}
                    maxLength={32}
                    value={pool.name}
                    onChange={(e) =>
                      edit((d) => {
                        d.resources.pools.find((p) => p.id === pool.id)!.name =
                          e.target.value;
                      })
                    }
                  />
                </label>
                <NumberField
                  label={`Starting ${pool.name}`}
                  value={pool.starting}
                  max={1000000}
                  onChange={(v) =>
                    edit((d) => {
                      d.resources.pools.find(
                        (p) => p.id === pool.id,
                      )!.starting = v;
                    })
                  }
                />
                <NumberField
                  label={`${pool.name} gained per turn`}
                  value={pool.perTurn}
                  max={1000000}
                  onChange={(v) =>
                    edit((d) => {
                      d.resources.pools.find((p) => p.id === pool.id)!.perTurn =
                        v;
                    })
                  }
                />
              </div>
              <button
                className="text-button"
                disabled={rules.pools.length === 1}
                onClick={() =>
                  edit((d) => {
                    d.resources.pools = d.resources.pools.filter(
                      (p) => p.id !== pool.id,
                    );
                    for (const b of d.resources.effects)
                      if (b.poolId === pool.id)
                        b.poolId = d.resources.pools[0].id;
                    for (const interaction of [
                      ...d.definition.actions,
                      ...d.definition.triggers,
                      ...d.definition.constraints,
                    ])
                      for (const condition of interaction.conditions)
                        if (
                          condition.kind === "resource_at_least" &&
                          condition.key === pool.id
                        )
                          condition.key = d.resources.pools[0].id;
                  })
                }
              >
                Remove {pool.name}
              </button>
            </div>
          ))}
          <button
            className="button button-outline"
            disabled={rules.pools.length >= 8}
            onClick={() =>
              edit((d) => {
                d.resources.pools.push({
                  id: newId("resource"),
                  name: `Resource ${d.resources.pools.length + 1}`,
                  starting: 0,
                  perTurn: 0,
                });
              })
            }
          >
            Add resource pool
          </button>
          <p className="quiet-note">
            Each player has their own pools. Gains apply at the start of their
            next turn. Set card costs in Cards.
          </p>
          {doc.definition.actions
            .filter((a) => a.sourceZone === "none")
            .map((action) => (
              <CardResourceCosts
                key={action.id}
                document={doc}
                edit={edit}
                actionId={action.id}
                cardId=""
              />
            ))}
        </>
      )}
    </fieldset>
  );
}

export function CardResourceCosts({
  document: doc,
  edit,
  actionId,
  cardId,
}: Props & { actionId: string; cardId: string }) {
  const action = doc.definition.actions.find((a) => a.id === actionId);
  if (!action || !doc.resources.enabled) return null;
  const costs = resourceCosts(action, cardId, doc.resources);
  return (
    <fieldset className="creation-section">
      <legend>{action.label} cost</legend>
      <div className="form-grid">
        {doc.resources.pools.map((pool) => (
          <NumberField
            key={pool.id}
            label={`${action.label}: ${pool.name}`}
            value={costs.find((c) => c.poolId === pool.id)?.amount ?? 0}
            max={1000000}
            onChange={(v) =>
              edit((d) => {
                let row = d.resources.costs.find(
                  (c) => c.actionId === actionId && c.cardId === cardId,
                );
                if (!row) {
                  row = {
                    actionId,
                    cardId,
                    amounts: costs.map((c) => ({ ...c })),
                  };
                  d.resources.costs.push(row);
                }
                const amount = row.amounts.find((a) => a.poolId === pool.id);
                if (amount) amount.amount = v;
                else row.amounts.push({ poolId: pool.id, amount: v });
              })
            }
          />
        ))}
      </div>
    </fieldset>
  );
}
