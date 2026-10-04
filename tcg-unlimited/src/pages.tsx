import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { motion } from "motion/react";
import { cardHue, hueColor } from "./colors";
import {
  cards as demoCards,
  deckCount,
  games as demoGames,
  useLocalState,
  type PreviewCard,
  type PreviewGame,
} from "./preview-data";
import { usePreview } from "./PreviewContext";
import { useGameData } from "./GameDataContext";
import LiveRoom from "./components/LiveRoom";
import GameCreationEditor from "./components/GameCreationEditor";
import { EmptyState, Eyebrow, Icon } from "./ui";

function PageHeading({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: ReactNode;
  copy: string;
  action?: ReactNode;
}) {
  return (
    <section className="page-heading">
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1>{title}</h1>
        {copy && <p>{copy}</p>}
      </div>
      {action && <div className="heading-action">{action}</div>}
    </section>
  );
}
function Breadcrumb({ children }: { children: ReactNode }) {
  return (
    <div className="breadcrumb">
      <Link to="/">Games</Link>
      <Icon name="chevron" size={12} />
      {children}
    </div>
  );
}
export function GameCard({
  game,
  index,
}: {
  game: PreviewGame;
  index: number;
}) {
  const { favorites, toggleFavorite } = usePreview();
  const saved = favorites.includes(game.id);
  return (
    <motion.article
      className="game-card"
      whileHover={{ y: -5 }}
      transition={{ duration: 0.22 }}
    >
      <div className="game-card-top">
        <span>VOL. {String(index + 1).padStart(2, "0")}</span>
        <button
          className={`icon-button ${saved ? "is-saved" : ""}`}
          aria-label={`${saved ? "Unsave" : "Save"} ${game.title}`}
          aria-pressed={saved}
          onClick={() => toggleFavorite(game.id)}
        >
          <Icon name="bookmark" size={16} />
        </button>
      </div>
      <Link
        className="game-art-link"
        to={`/games/${game.id}`}
        aria-label={`Explore ${game.title}`}
      >
        <CardFan variant={game.variant} gameId={game.id} />
        <span className="art-label">
          {game.genre.toUpperCase()} / {game.cards} CARDS
        </span>
        <span className="art-corner">↗</span>
      </Link>
      <div className="game-card-body">
        <div className="game-specs">
          <span>
            <Icon name="users" size={13} />
            {game.players} players
          </span>
          <span>
            <Icon name="clock" size={13} />
            {game.minutes} min
          </span>
        </div>
        <Link to={`/games/${game.id}`} className="game-title">
          {game.title}
        </Link>
        <div className="game-card-bottom">
          <span className="creator">
            <span className="avatar">{game.initials}</span>
            {game.creator}
          </span>
          <Link
            to={`/games/${game.id}`}
            className="icon-button"
            aria-label={`Open ${game.title}`}
          >
            <Icon name="arrow" size={18} />
          </Link>
        </div>
      </div>
    </motion.article>
  );
}
export function GameGalleryPage() {
  const { games, ready, pending, addStarterGames } = useGameData();
  const [filter, setFilter] = useState("All games");
  const [query, setQuery] = useState("");
  const [view, setView] = useState("grid");
  const [sort, setSort] = useState("Featured");
  const { favorites } = usePreview();
  const filtered = games.filter(
    (g) =>
      (filter === "All games" ||
        filter === g.genre ||
        (filter === "Saved" && favorites.includes(g.id))) &&
      `${g.title} ${g.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const displayed =
    sort === "A–Z"
      ? [...filtered].sort((a, b) => a.title.localeCompare(b.title))
      : sort === "Quickest"
        ? [...filtered].sort(
            (a, b) => parseInt(a.minutes) - parseInt(b.minutes),
          )
        : filtered;
  return (
    <>
      <section id="collection" className="collection">
        <div className="section-heading">
          <div>
            <h1>
              Games<span className="heading-count">{games.length}</span>
            </h1>
          </div>
          <div className="collection-tools">
            <label className="search-box">
              <Icon name="search" size={17} />
              <input
                aria-label="Search games"
                placeholder="Find your next game"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>/</kbd>
            </label>
            <label className="sort-control">
              <span className="sr-only">Sort games</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option>Featured</option>
                <option>A–Z</option>
                <option>Quickest</option>
              </select>
            </label>
          </div>
        </div>
        <div className="collection-filters">
          <div className="filter-tabs">
            {["All games", "Strategy", "Duel", "Party", "Saved"].map((f) => (
              <button
                key={f}
                className={filter === f ? "active" : ""}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f}
                {f === "All games" && <span>{games.length}</span>}
                {f === "Saved" && <span>{favorites.length}</span>}
              </button>
            ))}
          </div>
          <div className="view-switch">
            <button
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
              className={view === "grid" ? "active" : ""}
            >
              <Icon name="grid" size={16} />
            </button>
            <button
              aria-label="List view"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={view === "list" ? "active" : ""}
            >
              <Icon name="list" size={17} />
            </button>
          </div>
        </div>
        {displayed.length ? (
          <div className={`game-grid ${view === "list" ? "game-list" : ""}`}>
            {displayed.map((g) => (
              <GameCard key={g.id} game={g} index={games.indexOf(g)} />
            ))}
          </div>
        ) : (
          <EmptyState title="No games found">
            Try another search or filter.
            {ready && !games.length && (
              <button
                className="button button-light"
                disabled={pending}
                onClick={() => void addStarterGames()}
              >
                Add starter games
              </button>
            )}
          </EmptyState>
        )}
      </section>
    </>
  );
}

export function GameDetailsPage() {
  const { gameById, cardsForGame, createRoom, ready, pending, versions, drafts } = useGameData();
  const navigate = useNavigate();
  const { gameId } = useParams();
  const game = gameById(gameId);
  const [tab, setTab] = useState("Overview");
  const { favorites, toggleFavorite } = usePreview();
  if (!game && !ready && gameId?.startsWith("game-"))
    return <p role="status">Connecting to the game…</p>;
  if (!game) return <NotFoundPage />;
  const cards = cardsForGame(game.id);
  const version = versions.find((item) => item.id === game.versionId);
  const editableDraft = drafts.find((item) => item.id === version?.draftId);
  return (
    <>
      <Breadcrumb>
        <span>{game.title}</span>
      </Breadcrumb>
      <section className="game-detail-hero">
        <div className="detail-art">
          <CardFan variant={game.variant} gameId={game.id} />
        </div>
        <div className="detail-copy">
          <Eyebrow>
            {game.genre.toUpperCase()} / {ready ? "GAME" : "DEMO GAME"}
          </Eyebrow>
          <h1>{game.title}</h1>
          <div className="creator">
            <span className="avatar">{game.initials}</span>Designed by{" "}
            {game.creator}
            <span className="version-badge">V {version?.version ?? 1}</span>
          </div>
          <div className="detail-stats">
            <div>
              <Icon name="users" />
              <b>{game.players}</b>
              <span>PLAYERS</span>
            </div>
            <div>
              <Icon name="clock" />
              <b>{game.minutes}</b>
              <span>MINUTES</span>
            </div>
            <div>
              <Icon name="cards" />
              <b>{game.cards}</b>
              <span>CARDS</span>
            </div>
          </div>
          <div className="detail-actions">
            {editableDraft && <Link className="button button-outline" to={`/create?draft=${editableDraft.id}`}>Edit game rules</Link>}
            <Link
              className="button button-light"
              to={`/games/${game.id}/decks`}
            >
              Build your deck
              <Icon name="arrow" size={18} />
            </Link>
            <button
              className="button button-outline"
              disabled={!ready || pending}
              onClick={async () => {
                const id = await createRoom(game.id);
                if (id) navigate(`/rooms/${id}`);
              }}
            >
              Create room
              <Icon name="field" size={17} />
            </button>
            <button
              className="icon-button large"
              onClick={() => toggleFavorite(game.id)}
              aria-label={
                favorites.includes(game.id) ? "Unsave game" : "Save game"
              }
              aria-pressed={favorites.includes(game.id)}
            >
              <Icon name="bookmark" />
            </button>
          </div>
        </div>
      </section>
      <div className="filter-tabs detail-tabs">
        {["Overview", "Rules", "Card library"].map((t) => (
          <button
            className={tab === t ? "active" : ""}
            aria-pressed={tab === t}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Card library" ? (
        <div className="library-grid">
          {cards.map((c) => (
            <PlayingCard key={c.id} card={c} />
          ))}
        </div>
      ) : (
        <div className="detail-bottom">
          <section className="panel">
            <h2>{tab === "Rules" ? "Rules" : "Overview"}</h2>
            <p>
              {tab === "Rules"
                ? `Each player begins with ${game.health} health and ${game.definition?.hand.initial ?? 3} cards. Bring your opponents’ health to zero to win. Turn phases: ${game.definition?.phases.map((phase) => phase.name).join(" → ") ?? "Main → Attack → End"}.`
                : game.description}
            </p>
          </section>
          <aside className="panel compact-panel">
            <Eyebrow>AT A GLANCE</Eyebrow>
            <dl className="data-list">
              <div>
                <dt>Win condition</dt>
                <dd>Health</dd>
              </div>
              <div>
                <dt>Starting health</dt>
                <dd>{game.health} {game.healthName ?? "LP"}</dd>
              </div>
              <div>
                <dt>Starting hand</dt>
                <dd>{game.definition?.hand.initial ?? 3} cards</dd>
              </div>
              <div>
                <dt>Field</dt>
                <dd>
                  {game.definition?.field.rows ?? 2} ×{" "}
                  {game.definition?.field.columns ?? 3} matrix
                </dd>
              </div>
              <div>
                <dt>Turn sequence</dt>
                <dd>
                  {game.definition?.phases
                    .map((phase) => phase.name)
                    .join(" → ") ?? "Main → Attack → End"}
                </dd>
              </div>
            </dl>
            {!ready && <p className="quiet-note">Demo game.</p>}
          </aside>
        </div>
      )}
    </>
  );
}

export function PlayingCard({ card }: { card: PreviewCard }) {
  const { cardColorChoices } = usePreview();
  const hue = cardHue(cardColorChoices[card.id], card.name);
  const color = hueColor(hue);
  return (
    <div
      className="card-frame"
      style={
        {
          "--card-accent": color,
          "--card-tint": `hsl(${hue} 70% 76% / 0.09)`,
        } as CSSProperties
      }
    >
      <div className="playing-card">
        <div className="playing-card-top">
          <span>{card.type}</span>
          <span className="card-cost">{card.cost}</span>
        </div>
        <h3>{card.name}</h3>
        <p>{card.text}</p>
        <div className="card-stats">
          {(
            card.stats ?? [
              { label: "ATK", value: card.attack },
              { label: "DEF", value: card.defense },
            ]
          ).map((stat) => (
            <span key={stat.label}>
              {stat.label} <b>{stat.value}</b>
            </span>
          ))}
          <span className="card-mark">✳</span>
        </div>
      </div>
    </div>
  );
}

export function CardFan({
  variant,
  cardIds,
  gameId,
  versionId,
}: {
  variant: PreviewGame["variant"];
  cardIds?: string[];
  gameId?: string;
  versionId?: bigint;
}) {
  const data = useGameData();
  const cards = gameId ? data.cardsForGame(gameId, versionId) : data.cards;
  const pool = cardIds
    ? cards.filter((c) => cardIds.includes(c.id))
    : [
        ...cards.filter((c) => c.variant === variant),
        ...cards.filter((c) => c.variant !== variant),
      ];
  const preview = pool.slice(0, 3);
  if (preview.length > 1) {
    [preview[0], preview[1]] = [preview[1], preview[0]];
  }
  return (
    <div className="card-fan">
      {preview.map((card) => (
        <PlayingCard key={card.id} card={card} />
      ))}
    </div>
  );
}

function NewDeckDialog({
  gameId,
  onClose,
}: {
  gameId?: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { games, saveDeck, ready, pending } = useGameData();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(gameId ?? games[0]?.id ?? "");
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const id = await saveDeck({ name, gameId: selected, entries: {} });
    if (!id) return;
    onClose();
    navigate(`/decks/${id}/edit`);
  };
  return (
    <dialog
      className="studio-dialog"
      aria-labelledby="new-deck-title"
      ref={dialog}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form onSubmit={create}>
        <div className="dialog-top">
          <Eyebrow>DECK</Eyebrow>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" />
          </button>
        </div>
        <h2 id="new-deck-title">New deck</h2>
        <label className="form-label">
          Deck name
          <input
            autoFocus
            required
            maxLength={60}
            placeholder="Deck name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="form-label">
          Game
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {games.map((g) => (
              <option value={g.id} key={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button button-light"
          type="submit"
          disabled={!ready || pending || !selected}
        >
          Create deck
          <Icon name="arrow" />
        </button>
        <p className="quiet-note">Decks are saved in SpacetimeDB.</p>
      </form>
    </dialog>
  );
}
export function SavedDecksPage() {
  const { gameId } = useParams();
  const { decks, games, gameById, saveDeck, ready, pending } = useGameData();
  const [modal, setModal] = useState(false);
  const [query, setQuery] = useState("");
  const [gameFilter, setGameFilter] = useState(gameId ?? "all");
  useEffect(() => setGameFilter(gameId ?? "all"), [gameId]);
  const filtered = decks.filter(
    (d) =>
      (gameFilter === "all" || d.gameId === gameFilter) &&
      d.name.toLowerCase().includes(query.toLowerCase()),
  );
  const duplicate = async (id: string) => {
    const deck = decks.find((d) => d.id === id)!;
    await saveDeck({
      gameId: deck.gameId,
      name: `${deck.name} / copy`,
      entries: deck.entries,
      versionId: deck.versionId,
    });
  };
  return (
    <>
      <PageHeading
        eyebrow=""
        title="Decks"
        copy=""
        action={
          <button
            className="button button-light"
            onClick={() => setModal(true)}
          >
            <Icon name="plus" />
            New deck
          </button>
        }
      />
      <div className="collection-filters">
        <label className="search-box">
          <Icon name="search" size={17} />
          <input
            aria-label="Search decks"
            placeholder="Search your decks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="sort-control">
          <span className="sr-only">Filter decks by game</span>
          <select
            value={gameFilter}
            onChange={(e) => setGameFilter(e.target.value)}
          >
            <option value="all">All games</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        <span className="micro muted">
          {filtered.length} DECKS IN YOUR COLLECTION
        </span>
      </div>
      <div className="decks-grid">
        {filtered.map((deck, i) => {
          const game = gameById(deck.gameId)!;
          const count = deckCount(deck);
          return (
            <article className="deck-tile" key={deck.id}>
              <div className="deck-tile-top">
                <span className="micro">
                  DECK / {String(i + 1).padStart(2, "0")}
                </span>
                <span className="status-tag">
                  {(deck.complete ?? count >= 12) ? "Ready" : "In progress"}
                </span>
              </div>
              <Link
                to={`/decks/${deck.id}/edit`}
                className="deck-stack"
                aria-label={`Edit ${deck.name}`}
              >
                {count ? (
                  <CardFan
                    variant={game.variant}
                    gameId={game.id}
                    versionId={deck.versionId}
                    cardIds={Object.keys(deck.entries).filter(
                      (id) => deck.entries[id] > 0,
                    )}
                  />
                ) : (
                  <span className="empty-deck-cover">Empty deck</span>
                )}
              </Link>
              <div className="deck-tile-body">
                <span className="micro muted">{game.title}</span>
                <h2>
                  <Link to={`/decks/${deck.id}/edit`}>{deck.name}</Link>
                </h2>
                <div className="deck-meta">
                  <span>
                    <Icon name="cards" size={15} />
                    {count} cards
                  </span>
                  <span>{deck.updated}</span>
                </div>
                <div className="deck-tile-footer">
                  <button
                    className="text-button"
                    onClick={() => duplicate(deck.id)}
                    disabled={!ready || pending}
                  >
                    <Icon name="copy" size={15} />
                    Duplicate
                  </button>
                  <Link className="text-button" to={`/decks/${deck.id}/edit`}>
                    Edit deck
                    <Icon name="arrow" size={16} />
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
        <button className="new-deck-tile" onClick={() => setModal(true)}>
          <span className="new-deck-plus">
            <Icon name="plus" size={32} />
          </span>
          <span className="text-button">
            Create a deck
            <Icon name="arrow" size={16} />
          </span>
        </button>
      </div>
      {modal && (
        <NewDeckDialog
          gameId={gameFilter === "all" ? undefined : gameFilter}
          onClose={() => setModal(false)}
        />
      )}
    </>
  );
}

export function DeckBuilderPage() {
  const { deckId } = useParams();
  const { notify, cardColorChoices, setCardColor } = usePreview();
  const {
    decks,
    gameById,
    cardsForGame,
    saveDeck,
    createRoom,
    ready,
    pending,
    versions,
    drafts,
  } = useGameData();
  const navigate = useNavigate();
  const deck = decks.find((d) => d.id === deckId);
  const [entries, setEntries] = useState<Record<string, number>>(
    deck?.entries ?? {},
  );
  const [name, setName] = useState(deck?.name ?? "");
  const [loadedRevision, setLoadedRevision] = useState(deck?.revision);
  const [filter, setFilter] = useState("All cards");
  const [query, setQuery] = useState("");
  useEffect(() => {
    setEntries(deck?.entries ?? {});
    setName(deck?.name ?? "");
    setLoadedRevision(deck?.revision);
  }, [deckId, deck?.id]);
  if (!deck && !ready && deckId?.startsWith("deck-"))
    return <p role="status">Connecting to the deck…</p>;
  if (!deck) return <NotFoundPage />;
  const game = gameById(deck.gameId)!;
  const definition = versions.find(
    (version) => version.id === deck.versionId,
  )?.definition;
  const editableDraft = drafts.find((item) => item.id === versions.find((version) => version.id === game.versionId)?.draftId);
  const cards = cardsForGame(game.id, deck.versionId);
  const rules = definition?.deckRules ?? {
    minSize: 12,
    maxSize: 24,
    maxCopies: 4,
    copyLimits: [],
  };
  const copyLimit = (id: string) =>
    rules.copyLimits.find((limit) => limit.cardId === id.split(":").at(-1))
      ?.maximum ?? rules.maxCopies;
  const count = deckCount({ entries });
  const dirty =
    name !== deck.name ||
    JSON.stringify(entries) !== JSON.stringify(deck.entries);
  const edit = (id: string, delta: number) =>
    setEntries((old) => {
      if (delta > 0 && deckCount({ entries: old }) >= rules.maxSize) {
        notify(`Deck limit: ${rules.maxSize} cards.`);
        return old;
      }
      const quantity = Math.max(
        0,
        Math.min(copyLimit(id), (old[id] ?? 0) + delta),
      );
      const next = { ...old };
      if (quantity) next[id] = quantity;
      else delete next[id];
      return next;
    });
  const save = async () => {
    if (!name.trim()) return;
    const id = await saveDeck({
      id: deck.id,
      gameId: game.id,
      name,
      entries,
      expectedRevision: loadedRevision,
    });
    if (id && loadedRevision !== undefined) setLoadedRevision(loadedRevision + 1);
    return id;
  };
  const filtered = cards.filter(
    (c) =>
      (filter === "All cards" || c.type === filter) &&
      c.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <Breadcrumb>
        <Link to={`/games/${game.id}/decks`}>Your decks</Link>
        <Icon name="chevron" size={12} />
        <span>{name}</span>
      </Breadcrumb>
      <div className="editor-heading">
        <div>
          <Eyebrow>DECK WORKSHOP / {game.title}</Eyebrow>
          <h1>{deck.name}</h1>
        </div>
        {editableDraft && <Link className="button button-outline" to={`/create?draft=${editableDraft.id}`}>Edit game rules</Link>}
        <button
          className="button button-light"
          onClick={save}
          disabled={!name.trim() || !ready || pending}
        >
          <Icon name="check" size={18} />
          {dirty ? "Save changes" : "Save deck"}
        </button>
      </div>
      <div className="deck-editor">
        <section className="card-library">
          <div className="section-heading">
            <h2>
              Card pool<span className="heading-count">{cards.length}</span>
            </h2>
            <label className="search-box">
              <Icon name="search" size={16} />
              <input
                aria-label="Search cards"
                placeholder="Find a card"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="filter-tabs library-tabs">
            {["All cards", ...new Set(cards.map((card) => card.type))].map(
              (t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={filter === t ? "active" : ""}
                  aria-pressed={filter === t}
                >
                  {t}
                </button>
              ),
            )}
          </div>
          <div className="library-grid">
            {filtered.map((c) => (
              <div className="library-card" key={c.id}>
                <PlayingCard card={c} />
                <label className="card-color-choice">
                  <span>Color</span>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    aria-label={`Color for ${c.name}`}
                    aria-valuetext={`Hue ${cardHue(cardColorChoices[c.id], c.name)} degrees`}
                    value={cardHue(cardColorChoices[c.id], c.name)}
                    onChange={(e) => setCardColor(c.id, Number(e.target.value))}
                  />
                </label>
                <div className="quantity-controls">
                  <button
                    className="icon-button"
                    aria-label={`Remove ${c.name}`}
                    disabled={!entries[c.id]}
                    onClick={() => edit(c.id, -1)}
                  >
                    <Icon name="minus" size={16} />
                  </button>
                  <span>
                    {entries[c.id] ?? 0} / {copyLimit(c.id)}
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`Add ${c.name}`}
                    disabled={
                      (entries[c.id] ?? 0) >= copyLimit(c.id) ||
                      count >= rules.maxSize
                    }
                    onClick={() => edit(c.id, 1)}
                  >
                    <Icon name="plus" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!filtered.length && (
            <EmptyState title="No cards in sight.">
              Try a different name or card type.
            </EmptyState>
          )}
        </section>
        <aside className="deck-summary panel">
          <div className="summary-head">
            <Eyebrow>DECK</Eyebrow>
            <span className="status-tag">
              {dirty ? "Unsaved changes" : ready ? "Saved" : "Local preview"}
            </span>
          </div>
          <label className="sr-only" htmlFor="deck-name">
            Deck name
          </label>
          <input
            id="deck-name"
            className="deck-name-input"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="deck-size">
            <strong>{String(count).padStart(2, "0")}</strong>
            <span>
              / {rules.maxSize}
              <br />
              CARDS
            </span>
            <Icon name="cards" size={30} />
          </div>
          <div className="progress-track">
            <span style={{ width: `${(count / rules.maxSize) * 100}%` }} />
          </div>
          <div className="deck-check">
            <Icon name={count >= rules.minSize ? "check" : "cards"} size={15} />
            {count >= rules.minSize
              ? "Ready to play"
              : `${rules.minSize - count} more cards to complete the deck`}
          </div>
          <div className="selected-cards">
            {Object.entries(entries)
              .filter(([, q]) => q > 0)
              .map(([id, q]) => {
                const card = cards.find((c) => c.id === id);
                return (
                  card && (
                    <div className="selected-card" key={id}>
                      <span className={`mini-art mini-art-${card.variant}`}>
                        <PlayingCard card={card} />
                      </span>
                      <div>
                        <b>{card.name}</b>
                        <span>
                          {card.type} / {card.cost} resource
                        </span>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={`Remove one ${card.name}`}
                        onClick={() => edit(id, -1)}
                      >
                        <Icon name="minus" size={13} />
                      </button>
                      <b className="micro">×{q}</b>
                    </div>
                  )
                );
              })}
            {!count && <p className="quiet-note">Add cards from the pool.</p>}
          </div>
          <div className="deck-rules">
            <span>
              <Icon name="check" size={14} />
              {rules.minSize}–{rules.maxSize} cards
            </span>
            <span>
              <Icon name="check" size={14} />
              {rules.maxCopies} copies maximum
            </span>
          </div>
          <button
            className="button button-outline full-width"
            disabled={count < rules.minSize || !ready || pending}
            onClick={async () => {
              if (dirty && !(await save())) return;
              const id = await createRoom(game.id, deck.id);
              if (id) navigate(`/rooms/${id}`);
            }}
          >
            Take it to the table
            <Icon name="arrow" size={17} />
          </button>
        </aside>
      </div>
    </>
  );
}

export function GameDesignerPage() {
  return <GameCreationEditor />;
}

export function RoomsPage() {
  const data = useGameData();
  const navigate = useNavigate();
  const create = async (id: string) => {
    const room = await data.createRoom(id);
    if (room) navigate(`/rooms/${room}`);
  };
  return (
    <>
      <PageHeading eyebrow="" title="Rooms" copy="" />
      <div className="rooms-list">
        {data.rooms.map((room) => (
          <article className="panel room-list-item" key={String(room.id)}>
            <div>
              <h2>{room.name}</h2>
              <p>
                {room.playerCount} players · {room.status}
              </p>
            </div>
            <Link
              className="button button-outline"
              to={`/rooms/room-${room.id}`}
            >
              Open room
            </Link>
          </article>
        ))}
        {data.ready && !data.rooms.length && <p>No rooms yet.</p>}
      </div>
      <h2>Create a room</h2>
      <div className="room-create-options">
        {data.games.map((game) => (
          <button
            className="button button-outline"
            key={game.id}
            disabled={!data.ready || data.pending}
            onClick={() => void create(game.id)}
          >
            {game.title}
          </button>
        ))}
      </div>
    </>
  );
}

export function RoomPage() {
  const data = useGameData();
  const { roomId } = useParams();
  return data.ready || roomId?.startsWith("room-") ? (
    <LiveRoom />
  ) : (
    <PreviewRoom />
  );
}

function PreviewRoom() {
  const games = demoGames;
  const cards = demoCards;
  const gameById = (id: string | undefined) =>
    games.find((game) => game.id === id);
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const requestedDeck = searchParams.get("deck");
  const game = gameById(roomId) ?? games[0];
  const { decks, notify } = usePreview();
  const compatible = decks.filter((d) => d.gameId === game.id);
  const initialDeck =
    compatible.find((d) => d.id === requestedDeck)?.id ??
    compatible[0]?.id ??
    "";
  const [selectedDeck, setSelectedDeck] = useState(initialDeck);
  const [ready, setReady] = useState(false);
  const [table, setTable] = useState(false);
  const [phase, setPhase] = useState(0);
  const [hand, setHand] = useState(cards.slice(0, 4));
  const [selected, setSelected] = useState<string | null>(null);
  const [field, setField] = useState<Record<number, PreviewCard>>({});
  const [roll, setRoll] = useState<number | null>(null);
  useEffect(() => {
    setSelectedDeck(initialDeck);
    setReady(false);
    setTable(false);
    setHand(cards.slice(0, 4));
    setField({});
    setSelected(null);
    setPhase(0);
    setRoll(null);
  }, [initialDeck, roomId, requestedDeck]);
  const deck = decks.find((d) => d.id === selectedDeck);
  const complete = deck && deckCount(deck) >= 12;
  const place = (slot: number) => {
    if (!selected || field[slot]) return;
    const card = hand.find((c) => c.id === selected)!;
    setField((old) => ({ ...old, [slot]: card }));
    setHand((old) => old.filter((c) => c.id !== selected));
    setSelected(null);
  };
  const reset = () => {
    setHand(cards.slice(0, 4));
    setField({});
    setSelected(null);
    setPhase(0);
    setRoll(null);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify("Table preview link copied.");
    } catch {
      notify("Copy the table preview URL from your address bar.");
    }
  };
  return (
    <>
      <Breadcrumb>
        <Link to={`/games/${game.id}`}>{game.title}</Link>
        <Icon name="chevron" size={12} />
        <span>The table</span>
      </Breadcrumb>
      <div className="editor-heading">
        <div>
          <Eyebrow>{game.title}</Eyebrow>
          <h1>{table ? "Table" : "Lobby"}</h1>
        </div>
        <div className="room-heading-tools">
          <span className="status-tag">
            {table ? "Layout preview" : "Demo lobby"}
          </span>
          <button className="button button-outline" onClick={copy}>
            <Icon name="copy" size={17} />
            Copy preview link
          </button>
        </div>
      </div>
      {table ? (
        <>
          <div className="table-toolbar">
            <span className="micro">{game.title} / FIRST-PERSON TABLE</span>
            <div className="phase-pills">
              {["Main", "Attack", "End"].map((p, i) => (
                <span className={phase === i ? "active" : ""} key={p}>
                  {p}
                </span>
              ))}
            </div>
            <button className="text-button" onClick={() => setTable(false)}>
              Back to lobby
              <Icon name="arrow" size={15} />
            </button>
          </div>
          <div className="table-scene">
            <div className="opponent-status">
              <span className="avatar">02</span>
              <div>
                <b>Opponent</b>
                <span>LAYOUT PREVIEW</span>
              </div>
              <strong>
                {game.health} <small>LP</small>
              </strong>
            </div>
            <div
              className="opponent-hand"
              aria-label="Opponent hand, face down"
            >
              {[0, 1, 2, 3].map((i) => (
                <div className="card-back" key={i}>
                  ✳
                </div>
              ))}
            </div>
            <div className="table-perspective">
              <div className="table-surface">
                <div className="table-field">
                  {Array.from({ length: 6 }, (_, i) => (
                    <button
                      key={i}
                      className={`table-slot ${selected && !field[i] ? "slot-available" : ""}`}
                      onClick={() => place(i)}
                      aria-label={
                        field[i]
                          ? `${field[i].name} on slot ${i + 1}`
                          : `Place selected card in slot ${i + 1}`
                      }
                      disabled={!selected || !!field[i]}
                    >
                      {field[i] ? (
                        <>
                          <PlayingCard card={field[i]} />
                        </>
                      ) : (
                        <>
                          <Icon name="plus" size={24} />
                          <span>{String(i + 1).padStart(2, "0")}</span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
                <div className="table-deck">
                  <span>✳</span>
                  <small>DECK</small>
                </div>
              </div>
            </div>
            <div className="player-status">
              <span className="avatar">YOU</span>
              <div>
                <b>You</b>
                <span>{hand.length} CARDS IN HAND</span>
              </div>
              <strong>
                {game.health} <small>LP</small>
              </strong>
            </div>
            <div className="player-hand" aria-label="Your hand">
              {hand.map((c, i) => (
                <motion.button
                  key={c.id}
                  className={`hand-card ${selected === c.id ? "selected" : ""}`}
                  style={{ rotate: `${(i - (hand.length - 1) / 2) * 5}deg` }}
                  whileHover={{ y: -18 }}
                  animate={{ y: selected === c.id ? -22 : 0 }}
                  onClick={() => setSelected(selected === c.id ? null : c.id)}
                  aria-label={`Select ${c.name}`}
                  aria-pressed={selected === c.id}
                >
                  <PlayingCard card={c} />
                </motion.button>
              ))}
            </div>
            <p className="table-instruction">
              {selected
                ? "CHOOSE AN OPEN SLOT TO PLACE YOUR CARD."
                : hand.length
                  ? "SELECT A CARD, THEN A SLOT."
                  : "YOUR HAND IS EMPTY. RESET TO EXPLORE AGAIN."}
            </p>
          </div>
          <div className="table-controls">
            <span className="quiet-note">
              Local layout preview. No match is running.
            </span>
            <button className="button button-outline" onClick={reset}>
              Reset table
            </button>
            <button
              className="button button-outline"
              onClick={() => setRoll(Math.floor(Math.random() * 6) + 1)}
            >
              <Icon name="dice" />
              {roll ? `Rolled ${roll}` : "Try the dice"}
            </button>
            <button
              className="button button-light"
              onClick={() => setPhase((phase + 1) % 3)}
            >
              Cycle phase
              <Icon name="arrow" />
            </button>
          </div>
        </>
      ) : (
        <div className="lobby-layout">
          <section className="panel lobby-seats">
            <div className="panel-title">
              <Eyebrow>THE PLAYERS</Eyebrow>
              <span className="micro muted">01 / 02 SEATS</span>
            </div>
            <div className="lobby-player">
              <div className="player-avatar">
                Y<span>+</span>
              </div>
              <div className="lobby-player-copy">
                <h2>
                  You<span className="status-tag">HOST</span>
                </h2>
                <span className="micro">
                  {ready ? "READY TO PREVIEW" : "CHOOSING A DECK"}
                </span>
              </div>
              <Icon name={ready ? "check" : "cards"} size={28} />
            </div>
            <div className="lobby-player empty-seat">
              <div className="player-avatar">
                <Icon name="plus" size={25} />
              </div>
              <div className="lobby-player-copy">
                <h2>Open seat</h2>
                <p>Live multiplayer pending.</p>
                <span className="micro">SEAT 02 / OPEN</span>
              </div>
            </div>
          </section>
          <aside className="panel room-setup">
            <Eyebrow>SET YOUR TABLE</Eyebrow>
            <h2>{game.title}</h2>
            <div className="room-art">
              <CardFan variant={game.variant} />
            </div>
            <label className="form-label">
              Your deck
              <select
                value={selectedDeck}
                onChange={(e) => {
                  setSelectedDeck(e.target.value);
                  setReady(false);
                }}
              >
                <option value="">Choose a deck</option>
                {compatible.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} / {deckCount(d)} cards
                  </option>
                ))}
              </select>
            </label>
            <Link className="text-button" to={`/games/${game.id}/decks`}>
              Visit your deck collection
              <Icon name="arrow" size={15} />
            </Link>
            <div className="room-checks">
              <span>
                <Icon name="users" size={15} />2 player seats
              </span>
              <span>
                <Icon name="cards" size={15} />
                Hands outside the field
              </span>
              <span>
                <Icon name="check" size={15} />
                Health victory
              </span>
            </div>
            <button
              className={`button ${ready ? "button-outline" : "button-light"} full-width`}
              disabled={!complete}
              onClick={() => setReady(!ready)}
            >
              <Icon name={ready ? "check" : "cards"} />
              {ready ? "Ready / change status" : "Mark yourself ready"}
            </button>
            <button
              className="button button-light full-width"
              disabled={!ready}
              onClick={() => setTable(true)}
            >
              Open table preview
              <Icon name="arrow" />
            </button>
            {!complete && (
              <p className="quiet-note">
                Choose a preview deck with at least 12 cards.
              </p>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
export function NotFoundPage() {
  return (
    <div className="not-found">
      <h1>Page not found</h1>
      <Link className="button button-light" to="/">
        Back to the collection
        <Icon name="arrow" />
      </Link>
    </div>
  );
}
