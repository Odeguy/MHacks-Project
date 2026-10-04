import { afterAll, describe, expect, it } from "vitest";
import { DbConnection, tables } from "../../src/module_bindings";
import { designGame } from "../designer";
import { executeTool } from "../tools";
import { mockGrok } from "./fixtures";

const enabled = process.env.TCG_BACKEND_INTEGRATION === "1";
const connections: DbConnection[] = [];
const poll = (check: () => boolean) =>
  expect.poll(check, { timeout: 5000 }).toBe(true);
function connect(): Promise<DbConnection> {
  const host = process.env.TCG_TEST_HOST ?? "ws://127.0.0.1:3199";
  const database = process.env.TCG_TEST_DATABASE ?? "tcg-backend-test";
  if (
    !/^ws:\/\/(127\.0\.0\.1|localhost):\d+$/.test(host) ||
    !database.startsWith("tcg-backend-test")
  )
    throw new Error("Use an isolated local test database");
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .onConnect((c) => {
        connections.push(c);
        c.subscriptionBuilder()
          .onApplied(() => resolve(c))
          .onError((ctx) => reject(ctx.event))
          .subscribe([
            tables.myDrafts,
            tables.myDraftRules,
            tables.myDraftSpecialRules,
            tables.myDraftResourceRules,
            tables.gameVersion,
            tables.versionRules,
            tables.versionSpecialRules,
            tables.versionResourceRules,
          ]);
      })
      .onConnectError((_ctx, error) => reject(error))
      .build();
  });
}

describe.runIf(enabled)("generated drafts on SpacetimeDB", () => {
  afterAll(() => connections.forEach((c) => c.disconnect()));
  it("saves all generated rule groups privately and publishes an immutable version", async () => {
    const { document: generated } = await designGame("A small duel", {
      apiKey: "test-key",
      model: "test-model",
      fetch: mockGrok(),
    });
    const doc = executeTool(generated, "configure_resources", {
      enabled: true,
      pools: [
        { id: "red", name: "Red mana", starting: 4, perTurn: 1 },
        { id: "blue", name: "Blue mana", starting: 3, perTurn: 2 },
      ],
      costs: [
        {
          actionId: "play",
          cardId: "scout",
          amounts: [{ poolId: "red", amount: 2 }],
        },
      ],
      effects: [],
    }).document;
    const alice = await connect(),
      bob = await connect();
    const requestId = `grok-agent-${Date.now()}`;
    await alice.reducers.createGameDraft({
      requestId,
      title: doc.name,
      description: doc.prompt,
    });
    await poll(() =>
      [...alice.db.myDrafts.iter()].some((d) => d.requestId === requestId),
    );
    const draft = [...alice.db.myDrafts.iter()].find(
      (d) => d.requestId === requestId,
    )!;
    await alice.reducers.updateResourceDesignerDraft({
      draftId: draft.id,
      expectedRevision: draft.revision,
      title: doc.name,
      description: doc.prompt,
      definition: doc.definition,
      rules: doc.rules,
      special: doc.special,
      resources: doc.resources,
    });
    await poll(
      () =>
        alice.db.myDrafts.id.find(draft.id)?.revision === draft.revision + 1,
    );
    expect(alice.db.myDrafts.id.find(draft.id)?.definition.cards).toHaveLength(
      3,
    );
    expect(
      alice.db.myDraftRules.draftId
        .find(draft.id)
        ?.rules.phases[0].steps.find((s) => s.kind === "play")?.maximum,
    ).toBe(2);
    expect(
      alice.db.myDraftResourceRules.draftId.find(draft.id)?.rules.pools[1].name,
    ).toBe("Blue mana");
    expect([...bob.db.myDrafts.iter()]).toHaveLength(0);
    expect([...bob.db.myDraftResourceRules.iter()]).toHaveLength(0);
    await alice.reducers.validateGameDraft({
      draftId: draft.id,
      expectedRevision: draft.revision + 1,
    });
    await poll(
      () =>
        alice.db.myDrafts.id.find(draft.id)?.validatedRevision ===
        draft.revision + 1,
    );
    await alice.reducers.publishGame({
      draftId: draft.id,
      expectedRevision: draft.revision + 1,
      gameId: undefined,
    });
    await poll(() =>
      [...alice.db.gameVersion.iter()].some((v) => v.draftId === draft.id),
    );
    const version = [...alice.db.gameVersion.iter()].find(
      (v) => v.draftId === draft.id,
    )!;
    await poll(
      () => !!alice.db.versionResourceRules.versionId.find(version.id),
    );
    expect(
      alice.db.versionRules.versionId.find(version.id)?.rules.healthName,
    ).toBe("HP");
    expect(
      alice.db.versionSpecialRules.versionId.find(version.id)?.rules,
    ).toEqual(doc.special);
    expect(
      alice.db.versionResourceRules.versionId.find(version.id)?.rules,
    ).toEqual(doc.resources);
  });
});
