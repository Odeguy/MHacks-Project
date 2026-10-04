import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { DbConnection, tables } from "./module_bindings";
import type {
  ActionInput,
  GameDefinition,
  DesignerRules,
} from "./module_bindings/types";
import type { DesignerDocument } from "./designer-model";
import {
  games as demoGames,
  cards as demoCards,
  starterDecks,
  type PreviewGame,
  type PreviewCard,
  type PreviewDeck,
} from "./preview-data";
import { usePreview } from "./PreviewContext";
import {
  definitionFromSettings,
  type DesignSettings,
} from "./game-definitions";

export function cardKey(version: bigint, id: string) {
  return `${version}:${id}`;
}
export function cardId(key: string) {
  return key.slice(key.indexOf(":") + 1);
}

export function displayCard(
  version: bigint,
  definition: GameDefinition,
  id: string,
): PreviewCard {
  const card = definition.cards.find((item) => item.id === id)!;
  const format = definition.formats.find((item) => item.id === card.formatId)!;
  const value = (key: string) =>
    card.values.find((item) => item.key === key)?.numberValue ?? 0;
  return {
    id: cardKey(version, id),
    name: card.name,
    type: format.name,
    attack: value("atk"),
    defense: value("def"),
    text: card.values
      .filter((item) => item.textValue)
      .map((item) => item.textValue)
      .join(" "),
    cost:
      definition.actions.find((item) => item.kind === "play")?.resourceCost ??
      0,
    variant: "orbit",
    stats: format.fields
      .filter((field) => field.kind === "number")
      .map((field) => ({ label: field.label, value: value(field.key) })),
  };
}

function useDatabaseState() {
  const { isActive, identity, getConnection, connectionError } =
    useSpacetimeDB();
  const conn = getConnection() as DbConnection | null;
  const preview = usePreview();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const [published] = useTable(tables.publishedGame);
  const [versions] = useTable(tables.gameVersion);
  const [saved] = useTable(tables.myDecks);
  const [drafts] = useTable(tables.myDrafts);
  const [draftRuleRows] = useTable(tables.myDraftRules);
  const [versionRuleRows] = useTable(tables.versionRules);
  const [rooms] = useTable(tables.room);
  const [memberships] = useTable(tables.myMemberships);
  const [participants] = useTable(tables.roomParticipants);
  const [matches] = useTable(tables.myMatches);
  const [players] = useTable(tables.matchPlayers);
  const [visibleCards] = useTable(tables.visibleMatchCards);
  const [history] = useTable(tables.matchHistory);
  const [users] = useTable(tables.user);

  useEffect(() => {
    setReady(false);
    if (!isActive || !conn) return;
    setError("");
    const subscription = conn
      .subscriptionBuilder()
      .onApplied(() => setReady(true))
      .onError((ctx) => setError(ctx.event?.message ?? "Subscription failed"))
      .subscribe([
        tables.publishedGame,
        tables.gameVersion,
        tables.myDecks,
        tables.myDrafts,
        tables.myDraftRules,
        tables.versionRules,
        tables.room,
        tables.myMemberships,
        tables.roomParticipants,
        tables.myMatches,
        tables.matchPlayers,
        tables.visibleMatchCards,
        tables.matchHistory,
        tables.user,
      ]);
    return () => {
      subscription.unsubscribe();
    };
  }, [isActive, conn]);

  const games: PreviewGame[] = ready
    ? published.flatMap((row) => {
        const version = versions.find(
          (item) => item.id === row.latestVersionId,
        );
        if (!version) return [];
        return [
          {
            id: `game-${row.id}`,
            title: row.title,
            subtitle: "",
            description: row.description,
            genre: "Strategy",
            players:
              version.definition.participants.minimum ===
              version.definition.participants.maximum
                ? String(version.definition.participants.maximum)
                : `${version.definition.participants.minimum}–${version.definition.participants.maximum}`,
            minutes: "—",
            cards: version.definition.cards.length,
            creator:
              users.find((u) => u.identity.equals(row.owner))?.name ?? "Player",
            initials: "P",
            variant: "orbit",
            health: version.definition.startingHealth,
            healthName:
              versionRuleRows.find((item) => item.versionId === version.id)
                ?.rules.healthName ?? "LP",
            versionId: version.id,
            definition: version.definition,
          },
        ];
      })
    : demoGames;
  const cards: PreviewCard[] = ready
    ? versions.flatMap((version) =>
        version.definition.cards.map((card) =>
          displayCard(version.id, version.definition, card.id),
        ),
      )
    : demoCards;
  const decks: PreviewDeck[] = ready
    ? saved.flatMap((deck) => {
        const version = versions.find((item) => item.id === deck.versionId);
        if (!version) return [];
        return [
          {
            id: `deck-${deck.id}`,
            name: deck.name,
            gameId: `game-${version.gameId}`,
            entries: Object.fromEntries(
              deck.entries.map((entry) => [
                cardKey(deck.versionId, entry.cardId),
                entry.quantity,
              ]),
            ),
            updated: "Saved in database",
            versionId: deck.versionId,
            revision: deck.revision,
            complete: deck.complete,
          },
        ];
      })
    : preview.decks;
  const gameById = (id: string | undefined) =>
    games.find((game) => game.id === id);
  const versionForGame = (id: string) => {
    const game = gameById(id);
    return versions.find((version) => version.id === game?.versionId);
  };
  const cardsForGame = (id: string, versionId?: bigint) => {
    const version =
      versions.find((item) => item.id === versionId) ?? versionForGame(id);
    return ready
      ? (version?.definition.cards.map((card) =>
          displayCard(version.id, version.definition, card.id),
        ) ?? [])
      : demoCards;
  };
  const requireConnection = () => {
    if (!conn || !ready || !isActive)
      throw new Error(
        "Database unavailable. Start SpacetimeDB and reconnect before saving or playing.",
      );
    return conn;
  };
  async function waitFor<T>(read: () => T | undefined): Promise<T> {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const row = read();
      if (row !== undefined) return row;
      if (!conn?.isActive)
        throw new Error(
          "Connection lost. Reconnect to see whether the request completed.",
        );
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error(
      "Waiting for the database timed out. Check the latest state before retrying.",
    );
  }
  async function run<T>(operation: () => Promise<T>): Promise<T | undefined> {
    setPending((value) => value + 1);
    setError("");
    try {
      return await operation();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      preview.notify(message);
      return undefined;
    } finally {
      setPending((value) => value - 1);
    }
  }
  async function saveDeck(input: {
    id?: string;
    gameId: string;
    name: string;
    entries: Record<string, number>;
    versionId?: bigint;
    expectedRevision?: number;
  }) {
    return run(async () => {
      const connection = requireConnection();
      const existing = input.id
        ? saved.find((deck) => `deck-${deck.id}` === input.id)
        : undefined;
      if (input.id && !existing) throw new Error("Deck no longer exists.");
      const versionId =
        existing?.versionId ??
        input.versionId ??
        versionForGame(input.gameId)?.id;
      if (!versionId) throw new Error("Published game version unavailable.");
      const requestId = existing?.requestId ?? crypto.randomUUID();
      await connection.reducers.saveDeck({
        deckId: existing?.id,
        expectedRevision: input.expectedRevision ?? existing?.revision,
        requestId,
        versionId,
        name: input.name.trim(),
        entries: Object.entries(input.entries)
          .filter(([, quantity]) => quantity > 0)
          .map(([key, quantity]) => ({ cardId: cardId(key), quantity })),
      });
      const row = await waitFor(() =>
        [...connection.db.myDecks.iter()].find(
          (deck) =>
            deck.requestId === requestId &&
            (!existing || deck.revision > existing.revision),
        ),
      );
      preview.notify("Deck saved.");
      return `deck-${row.id}`;
    });
  }
  async function writeDefinition(
    title: string,
    description: string,
    definition: GameDefinition,
    requestId: string = crypto.randomUUID(),
    draftId?: bigint,
    expectedRevision?: number,
    rules?: DesignerRules,
  ) {
    const connection = requireConnection();
    if (draftId === undefined) {
      await connection.reducers.createGameDraft({
        requestId,
        title,
        description,
      });
    }
    const draft = await waitFor(() =>
      [...connection.db.myDrafts.iter()].find((item) =>
        draftId === undefined
          ? item.requestId === requestId
          : item.id === draftId,
      ),
    );
    const update = {
      draftId: draft.id,
      expectedRevision: expectedRevision ?? draft.revision,
      title,
      description,
      definition,
    };
    if (rules)
      await connection.reducers.updateDesignerDraft({ ...update, rules });
    else await connection.reducers.updateGameDraft(update);
    return waitFor(() =>
      [...connection.db.myDrafts.iter()].find(
        (item) => item.id === draft.id && item.revision > draft.revision,
      ),
    );
  }
  async function saveDesign(
    settings: DesignSettings,
    draftId?: bigint,
    revision?: number,
  ) {
    return run(async () => {
      const draft = await writeDefinition(
        settings.name,
        settings.prompt,
        definitionFromSettings(settings),
        `ui-designer-${crypto.randomUUID()}`,
        draftId,
        revision,
      );
      preview.notify("Draft saved.");
      return draft;
    });
  }
  async function saveDesignerDocument(
    document: DesignerDocument,
    draftId?: bigint,
    revision?: number,
  ) {
    return run(async () => {
      const draft = await writeDefinition(
        document.name,
        document.prompt,
        document.definition,
        `ui-designer-${crypto.randomUUID()}`,
        draftId,
        revision,
        document.rules,
      );
      preview.notify("Draft saved.");
      return draft;
    });
  }
  async function publishDefinition(
    title: string,
    description: string,
    definition: GameDefinition,
    requestId: string = crypto.randomUUID(),
    draftId?: bigint,
    expectedRevision?: number,
    rules?: DesignerRules,
  ) {
    const connection = requireConnection();
    const updated = await writeDefinition(
      title,
      description,
      definition,
      requestId,
      draftId,
      expectedRevision,
      rules,
    );
    await connection.reducers.validateGameDraft({
      draftId: updated.id,
      expectedRevision: updated.revision,
    });
    const validated = await waitFor(() =>
      [...connection.db.myDrafts.iter()].find(
        (item) =>
          item.id === updated.id &&
          (item.validatedRevision === updated.revision ||
            !!item.validationError),
      ),
    );
    if (validated.validationError) throw new Error(validated.validationError);
    await connection.reducers.publishGame({
      draftId: updated.id,
      expectedRevision: updated.revision,
      gameId: [...connection.db.gameVersion.iter()].find(
        (item) => item.draftId === updated.id,
      )?.gameId,
    });
    const version = await waitFor(() =>
      [...connection.db.gameVersion.iter()].find(
        (item) =>
          item.draftId === updated.id &&
          item.draftRevision === updated.revision,
      ),
    );
    return version;
  }
  async function publishDesign(
    settings: DesignSettings,
    draftId?: bigint,
    revision?: number,
  ) {
    return run(async () => {
      const version = await publishDefinition(
        settings.name,
        settings.prompt,
        definitionFromSettings(settings),
        `ui-designer-${crypto.randomUUID()}`,
        draftId,
        revision,
      );
      preview.notify("Game published.");
      return `game-${version.gameId}`;
    });
  }
  async function publishDesignerDocument(
    document: DesignerDocument,
    draftId?: bigint,
    revision?: number,
  ) {
    return run(async () => {
      const version = await publishDefinition(
        document.name,
        document.prompt,
        document.definition,
        `ui-designer-${crypto.randomUUID()}`,
        draftId,
        revision,
        document.rules,
      );
      preview.notify("Game published.");
      return `game-${version.gameId}`;
    });
  }
  async function addStarterGames() {
    return run(async () => {
      const connection = requireConnection();
      for (const game of demoGames.slice(0, 3)) {
        const definition = definitionFromSettings({
          name: game.title,
          prompt: game.description,
          health: game.health,
          hand: 3,
          players: 2,
          rows: 1,
          columns: 3,
          dice: true,
          coin: true,
          phases: "Main, Attack, End",
        });
        const prior = [...connection.db.myDrafts.iter()].find(
          (item) => item.requestId === `starter-${game.id}`,
        );
        let version =
          prior &&
          [...connection.db.gameVersion.iter()].find(
            (item) => item.draftId === prior.id,
          );
        if (!version)
          version = await publishDefinition(
            game.title,
            game.description,
            definition,
            `starter-${game.id}`,
          );
        const recipe = starterDecks.find((deck) => deck.gameId === game.id)!;
        await connection.reducers.saveDeck({
          deckId: undefined,
          expectedRevision: undefined,
          requestId: `starter-deck-${game.id}`,
          versionId: version.id,
          name: recipe.name,
          entries: Object.entries(recipe.entries).map(([cardId, quantity]) => ({
            cardId,
            quantity,
          })),
        });
      }
      preview.notify("Starter games and decks added.");
    });
  }
  async function createRoom(gameId: string, deckId?: string) {
    return run(async () => {
      const connection = requireConnection();
      const deck = saved.find((item) => `deck-${item.id}` === deckId);
      const version = deck
        ? versions.find((item) => item.id === deck.versionId)
        : versionForGame(gameId);
      if (!version) throw new Error("Game version unavailable.");
      const requestId = crypto.randomUUID();
      await connection.reducers.createRoom({
        requestId,
        versionId: version.id,
        name: gameById(gameId)?.title ?? "Game room",
      });
      const room = await waitFor(() =>
        [...connection.db.room.iter()].find(
          (item) => item.requestId === requestId,
        ),
      );
      if (deck)
        await connection.reducers.selectDeck({
          roomId: room.id,
          deckId: deck.id,
        });
      return `room-${room.id}`;
    });
  }
  async function call(operation: (connection: DbConnection) => Promise<void>) {
    return run(async () => {
      await operation(requireConnection());
      return true;
    });
  }
  async function takeAction(
    matchId: bigint,
    expectedRevision: number,
    input: ActionInput,
  ) {
    return call((connection) =>
      connection.reducers.takeAction({ matchId, expectedRevision, input }),
    );
  }
  return {
    ready,
    isActive,
    identity,
    error: error || connectionError?.message || "",
    pending: pending > 0,
    games,
    cards,
    decks,
    drafts,
    draftRuleRows,
    versionRuleRows,
    versions,
    rooms,
    memberships,
    participants,
    matches,
    players,
    visibleCards,
    history,
    users,
    gameById,
    cardsForGame,
    saveDeck,
    saveDesign,
    saveDesignerDocument,
    publishDesignerDocument,
    publishDesign,
    addStarterGames,
    createRoom,
    call,
    takeAction,
  };
}

const GameDataContext = createContext<ReturnType<
  typeof useDatabaseState
> | null>(null);
export function GameDataProvider({ children }: { children: ReactNode }) {
  const value = useDatabaseState();
  return (
    <GameDataContext.Provider value={value}>
      {children}
    </GameDataContext.Provider>
  );
}
export function useGameData() {
  const context = useContext(GameDataContext);
  if (!context) throw new Error("Game data provider missing");
  return context;
}
