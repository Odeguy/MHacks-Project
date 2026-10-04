import { useState, useEffect } from "react";
import {
  fieldAdjustment,
  fieldModifierKinds,
} from "../../spacetimedb/src/field-effects";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { displayCard, useGameData } from "../GameDataContext";
import { usePreview } from "../PreviewContext";
import { CardFan, PlayingCard } from "../pages";
import { Icon } from "../ui";
import type { VisibleCardProjection } from "../module_bindings/types";
import { legacyResourceRules, resourceCosts } from "../../spacetimedb/src/resources";

export default function LiveRoom() {
  const data = useGameData();
  const { notify, nightMode } = usePreview();
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [sourceId, setSourceId] = useState<number | undefined>();
  const [actionId, setActionId] = useState("");
  const [targetSeat, setTargetSeat] = useState<number | undefined>();
  const [targetCard, setTargetCard] = useState<number | undefined>();
  const [slotId, setSlotId] = useState<string | undefined>();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const room = data.rooms.find((item) => `room-${item.id}` === roomId);
  const version = data.versions.find((item) => item.id === room?.versionId);
  if (!data.ready) return <p role="status">Connecting to the room…</p>;
  if (!room || !version)
    return (
      <>
        <h1>Room not found</h1>
        <Link to="/rooms">View rooms</Link>
      </>
    );

  const definition = version.definition;
  const extraRules = data.versionRuleRows.find(
    (row) => row.versionId === version.id,
  )?.rules;
  const healthName = extraRules?.healthName ?? "LP";
  const sideColors = ["#94ceff", "#fca5a5", "#c5acf5", "#9ee8c7"];
  const gameId = `game-${version.gameId}`;
  const member = data.memberships.find((item) => item.roomId === room.id);
  const participants = data.participants
    .filter((item) => item.roomId === room.id)
    .sort((a, b) => a.seat - b.seat);
  const match = data.matches.find((item) => item.roomId === room.id);
  const special = data.versionSpecialRows.find(
    (row) => row.versionId === version.id,
  )?.rules;
  const resources = data.versionResourceRows.find(row => row.versionId === version.id)?.rules ?? legacyResourceRules(definition);
  const balances = data.resourceBalances.find(row => row.matchId === match?.id)?.balances;
  const resourceSummary = (seat: number) => resources.enabled ? resources.pools.map(pool => {
    const amount = balances?.find(p => p.seat === seat)?.amounts.find(a => a.poolId === pool.id)?.amount
      ?? (pool.id === resources.pools[0].id ? data.players.find(p => p.matchId === match?.id && p.seat === seat)?.resource ?? 0 : 0);
    return `${amount} ${pool.name}`;
  }).join(" · ") : "";
  const reactionWindow = data.reactionWindows.find(
    (row) => row.matchId === match?.id,
  );
  const secondsLeft = reactionWindow
    ? Math.max(
        0,
        Math.ceil(
          (Number(reactionWindow.expiresAt.microsSinceUnixEpoch / 1000n) -
            now) /
            1000,
        ),
      )
    : 0;
  const myReaction =
    !!reactionWindow &&
    reactionWindow.responseSeat === member?.seat &&
    secondsLeft > 0;
  const players = data.players
    .filter((item) => item.matchId === match?.id)
    .sort((a, b) => a.seat - b.seat);
  const visible = data.visibleCards.filter(
    (item) => item.matchId === match?.id,
  );
  const me = players.find((player) => player.seat === member?.seat);
  const opponents = players.filter((player) => player.seat !== member?.seat);
  const compatible = data.decks.filter(
    (deck) => deck.versionId === room.versionId,
  );
  const chosenDeck = compatible.find(
    (deck) => `deck-${member?.deckId}` === deck.id,
  );
  const host = !!data.identity?.equals(room.host);
  const phase = match && definition.phases[match.phaseIndex];
  const subPhase = phase && phase.subPhases[match?.subPhaseIndex ?? 0];
  const handSpace = definition.spaces.find((space) => space.kind === "hand")!;
  const hand = visible
    .filter(
      (card) => card.ownerSeat === member?.seat && card.zone === handSpace.id,
    )
    .sort((a, b) => a.position - b.position);
  const source = visible.find(
    (card) => card.instanceId === sourceId && card.ownerSeat === member?.seat,
  );
  const sourceDefinition = definition.cards.find(
    (card) => card.id === source?.cardId,
  );
  const sourceFormat = definition.formats.find(
    (format) => format.id === sourceDefinition?.formatId,
  );
  const allowed = definition.actions.filter((action) =>
    myReaction
      ? action.kind === "activate" &&
        !!source &&
        special?.reactions.some(
          (r) =>
            r.cardId === source.cardId &&
            r.onActions.includes(reactionWindow!.actionKind),
        )
      : phase?.allowedActionIds.includes(action.id) &&
        (!subPhase || subPhase.allowedActionIds.includes(action.id)) &&
        !(
          action.kind === "activate" &&
          special?.reactions.some((r) => r.cardId === source?.cardId)
        ),
  );
  const actions = allowed.filter(
    (action) =>
      action.sourceZone === "none" ||
      (source?.zone === action.sourceZone &&
        [
          ...(sourceFormat?.buttons ?? []),
          ...(sourceDefinition?.actionIds ?? []),
        ].includes(action.id)),
  );
  const action = actions.find((item) => item.id === actionId) ?? actions[0];
  const myTurn =
    match?.status === "active" &&
    match.activeSeat === member?.seat &&
    !me?.eliminated;
  const canAct = !me?.eliminated && (myReaction || (myTurn && !reactionWindow));
  const selectSource = (card: VisibleCardProjection) => {
    setSourceId(sourceId === card.instanceId ? undefined : card.instanceId);
    setActionId(
      allowed.find((item) => item.sourceZone === card.zone)?.id ?? "",
    );
    setTargetCard(undefined);
    setSlotId(undefined);
  };
  const renderCard = (card: VisibleCardProjection) => {
    const definitionCard = displayCard(version.id, definition, card.cardId, resources);
    const formatId = definition.cards.find(
      (item) => item.id === card.cardId,
    )?.formatId;
    return {
      ...definitionCard,
      stats:
        definition.formats
          .find((format) => format.id === formatId)
          ?.fields.filter((field) => field.kind === "number")
          .map((field) => ({
            label: field.label,
            value:
              card.values.find((value) => value.key === field.key)
                ?.numberValue ?? 0,
          })) ?? definitionCard.stats,
    };
  };
  const act = async (slot?: string) => {
    if (!match || !action) return;
    const needsPlayer = ["opponent", "any_player"].includes(action.targetKind);
    const needsCard = ["own_card", "enemy_card", "any_card"].includes(
      action.targetKind,
    );
    const needsSlot =
      action.kind === "play" ||
      action.effects.some(
        (effect) => effect.kind === "move" && effect.zone === "field",
      );
    const input = {
      actionId: action.id,
      sourceInstanceId: action.sourceZone === "none" ? undefined : sourceId,
      targetSeat: needsPlayer
        ? (targetSeat ?? opponents.find((player) => !player.eliminated)?.seat)
        : undefined,
      targetInstanceId: needsCard ? targetCard : undefined,
      slotId: needsSlot ? (slot ?? slotId) : undefined,
    };
    const success = myReaction
      ? await data.call((connection) =>
          connection.reducers.reactToAction({
            matchId: match.id,
            expectedRevision: match.revision,
            input,
          }),
        )
      : await data.takeAction(match.id, match.revision, input);
    if (success) {
      setSourceId(undefined);
      setTargetCard(undefined);
      setSlotId(undefined);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify("Room link copied.");
    } catch {
      notify("Copy this room’s URL from the address bar.");
    }
  };
  const nameOf = (seat: number) => {
    const participant = participants.find((item) => item.seat === seat);
    return (
      data.users.find((user) => participant?.owner.equals(user.identity))
        ?.name ?? (seat === member?.seat ? "You" : `Player ${seat + 1}`)
    );
  };
  const eligibleTargets = visible.filter(
    (card) =>
      card.zone === "field" &&
      (action?.targetKind !== "own_card" || card.ownerSeat === member?.seat) &&
      (action?.targetKind !== "enemy_card" || card.ownerSeat !== member?.seat),
  );

  return (
    <>
      <div className="breadcrumb">
        <Link to="/rooms">Rooms</Link>
        <Icon name="chevron" size={12} />
        <Link to={`/games/${gameId}`}>{room.name}</Link>
      </div>
      <div className="editor-heading">
        <div>
          <h1>{match ? "Table" : "Lobby"}</h1>
          <p>{room.name}</p>
        </div>
        <button className="button button-outline" onClick={() => void copy()}>
          Copy room link
        </button>
      </div>
      {!member ? (
        <section className="panel">
          <p>
            {room.playerCount} / {definition.participants.maximum} seats ·{" "}
            {room.status}
          </p>
          <button
            className="button button-light"
            disabled={
              data.pending ||
              room.status !== "lobby" ||
              room.playerCount >= definition.participants.maximum
            }
            onClick={() =>
              void data.call((connection) =>
                connection.reducers.joinRoom({ roomId: room.id }),
              )
            }
          >
            Join room
          </button>
        </section>
      ) : !match ? (
        <div className="lobby-layout">
          <section className="panel lobby-seats">
            <div className="panel-title">
              <h2>Players</h2>
              <span>
                {room.playerCount} / {definition.participants.maximum}
              </span>
            </div>
            {participants.map((participant) => (
              <div className="lobby-player" key={String(participant.id)}>
                <span className="player-avatar">{participant.seat + 1}</span>
                <div className="lobby-player-copy">
                  <h2>{nameOf(participant.seat)}</h2>
                  <span className="micro">
                    {participant.ready
                      ? "READY"
                      : participant.hasDeck
                        ? "NOT READY"
                        : "CHOOSING A DECK"}
                  </span>
                </div>
                <Icon name={participant.ready ? "check" : "cards"} />
              </div>
            ))}
            {room.playerCount < definition.participants.maximum && (
              <p className="quiet-note">
                Share the room link to invite a player.
              </p>
            )}
          </section>
          <aside className="panel room-setup">
            <h2>Your deck</h2>
            <div className="room-art">
              <CardFan
                variant="orbit"
                gameId={gameId}
                versionId={room.versionId}
                cardIds={chosenDeck && Object.keys(chosenDeck.entries)}
              />
            </div>
            <label className="form-label">
              Deck
              <select
                aria-label="Your deck"
                value={chosenDeck?.id ?? ""}
                disabled={data.pending}
                onChange={(event) => {
                  const deck = compatible.find(
                    (item) => item.id === event.target.value,
                  );
                  if (deck)
                    void data.call((connection) =>
                      connection.reducers.selectDeck({
                        roomId: room.id,
                        deckId: BigInt(deck.id.slice(5)),
                      }),
                    );
                }}
              >
                <option value="">Choose a deck</option>
                {compatible.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                    {deck.complete ? "" : " (incomplete)"}
                  </option>
                ))}
              </select>
            </label>
            <Link className="text-button" to={`/games/${gameId}/decks`}>
              Build a deck
            </Link>
            <button
              className="button button-light full-width"
              disabled={!chosenDeck?.complete || data.pending}
              onClick={() =>
                void data.call((connection) =>
                  connection.reducers.setReady({
                    roomId: room.id,
                    ready: !member.ready,
                  }),
                )
              }
            >
              {member.ready ? "Unready" : "Ready"}
            </button>
            {host && (
              <button
                className="button button-light full-width"
                disabled={
                  data.pending ||
                  participants.length < definition.participants.minimum ||
                  participants.some((participant) => !participant.ready)
                }
                onClick={() =>
                  void data.call((connection) =>
                    connection.reducers.startMatch({ roomId: room.id }),
                  )
                }
              >
                Start match
              </button>
            )}
            <button
              className="text-button"
              disabled={data.pending}
              onClick={async () => {
                if (
                  await data.call((connection) =>
                    connection.reducers.leaveRoom({ roomId: room.id }),
                  )
                )
                  navigate("/rooms");
              }}
            >
              Leave room
            </button>
          </aside>
        </div>
      ) : (
        <>
          <div className="table-toolbar">
            <span className="micro">
              TURN {match.turn} · {nameOf(match.activeSeat)}
            </span>
            <div className="phase-pills">
              {definition.phases.map((item, index) => (
                <span
                  className={index === match.phaseIndex ? "active" : ""}
                  key={item.id}
                >
                  {item.name}
                </span>
              ))}
            </div>
            {subPhase && <span className="micro">{subPhase.name}</span>}
          </div>
          {reactionWindow && (
            <section
              className="panel reaction-panel"
              aria-label="Reaction window"
            >
              <div>
                <strong>
                  {myReaction
                    ? "Your reaction"
                    : `${nameOf(reactionWindow.responseSeat)} may react`}
                </strong>
                <p>
                  {definition.actions.find(
                    (a) => a.id === reactionWindow.actionId,
                  )?.label ?? "Action"}{" "}
                  by {nameOf(reactionWindow.originSeat)} resolved. {secondsLeft}
                  s remaining.
                </p>
                <p>Select a placed Trap and activate its effect, or pass.</p>
              </div>
              {(myReaction || secondsLeft === 0) && (
                <button
                  className="button button-outline"
                  disabled={data.pending}
                  onClick={() =>
                    void data.call((connection) =>
                      connection.reducers.passReaction({
                        matchId: match.id,
                        expectedRevision: match.revision,
                      }),
                    )
                  }
                >
                  {secondsLeft === 0 ? "Close expired window" : "Pass reaction"}
                </button>
              )}
            </section>
          )}
          {visible.some(
            (card) =>
              card.zone === "field" &&
              !players.find((p) => p.seat === card.ownerSeat)?.eliminated &&
              special?.fields.some((f) => f.cardId === card.cardId),
          ) && (
            <section
              className="panel field-rule-panel"
              aria-label="Active field rules"
            >
              <strong>Active field rules</strong>
              {visible
                .filter(
                  (card) =>
                    card.zone === "field" &&
                    !players.find((p) => p.seat === card.ownerSeat)
                      ?.eliminated &&
                    special?.fields.some((f) => f.cardId === card.cardId),
                )
                .map((card) => (
                  <div key={card.id}>
                    <b>{renderCard(card).name}</b>:{" "}
                    {special!.fields
                      .find((f) => f.cardId === card.cardId)!
                      .modifiers.map(
                        (m) =>
                          `${m.amount >= 0 ? "+" : ""}${m.amount} ${fieldModifierKinds.find((kind) => kind.id === m.kind)?.label} (${m.scope === "all" ? "everyone" : m.scope === "owner" ? nameOf(card.ownerSeat) : `opponents of ${nameOf(card.ownerSeat)}`}${m.formatId ? `, ${definition.formats.find((f) => f.id === m.formatId)?.name}` : ""})`,
                      )
                      .join(" · ")}
                  </div>
                ))}
            </section>
          )}
          <div className="table-scene live-table">
            <div className="opponent-status">
              {opponents.map((player) => (
                <div key={player.seat}>
                  <b>{nameOf(player.seat)}</b>
                  <strong>
                    {player.health} <small>{healthName}</small>
                  </strong>
                  <span>
                    {player.handCount} in hand{resources.enabled && ` · ${resourceSummary(player.seat)}`}
                  </span>
                </div>
              ))}
            </div>
            <div
              className="opponent-hand"
              aria-label="Opponent hand, face down"
            >
              {Array.from(
                { length: opponents[0]?.handCount ?? 0 },
                (_, index) => (
                  <div className="card-back" key={index}>
                    ✳
                  </div>
                ),
              )}
            </div>
            <div className="table-perspective">
              <div className="table-surface">
                <div
                  className="table-field"
                  style={{
                    gridTemplateColumns: `repeat(${definition.field.columns}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${definition.field.rows * players.length}, minmax(0, 1fr))`,
                  }}
                >
                  {[...opponents, ...(me ? [me] : [])].flatMap(
                    (player, areaIndex) =>
                      Array.from(
                        {
                          length:
                            definition.field.rows * definition.field.columns,
                        },
                        (_, index) => {
                          const row = Math.floor(
                              index / definition.field.columns,
                            ),
                            column = index % definition.field.columns;
                          const slot = definition.field.slots.find(
                            (item) =>
                              item.row === row && item.column === column,
                          );
                          if (
                            !slot ||
                            (slot.owner === "shared" && areaIndex !== 0)
                          )
                            return <div key={`${player.seat}:${index}`} />;
                          const card = visible.find(
                            (item) =>
                              item.zone === "field" &&
                              item.slotId === slot.id &&
                              (slot.owner === "shared" ||
                                item.ownerSeat === player.seat),
                          );
                          const mine =
                            slot.owner === "shared" ||
                            player.seat === member.seat;
                          const typeId = extraRules?.slots.find(
                            (item) => item.slotId === slot.id,
                          )?.typeId;
                          const slotName =
                            extraRules?.slotTypes.find(
                              (item) => item.id === typeId,
                            )?.name ?? slot.id;
                          const canPlace =
                            !extraRules ||
                            !source ||
                            extraRules.cardSlots
                              .find((item) => item.cardId === source.cardId)
                              ?.allowedTypeIds.includes(typeId ?? "");
                          return (
                            <button
                              key={`${player.seat}:${slot.id}`}
                              className={`table-slot ${card?.instanceId === sourceId || card?.instanceId === targetCard ? "selected" : ""} ${!card && source?.zone === handSpace.id && mine ? "slot-available" : ""}`}
                              style={{
                                borderColor: sideColors[player.seat % 4],
                                backgroundColor: nightMode
                                  ? "#000"
                                  : `${sideColors[player.seat % 4]}22`,
                              }}
                              aria-label={
                                card
                                  ? `${card.ownerSeat === member.seat ? "Select" : "Target"} ${renderCard(card).name} on ${slot.id}`
                                  : `Play in ${slotName} (${row + 1}, ${column + 1}), player ${player.seat + 1}`
                              }
                              disabled={
                                !canAct ||
                                data.pending ||
                                (!card &&
                                  (!mine ||
                                    !source ||
                                    !canPlace ||
                                    action?.kind !== "play"))
                              }
                              onClick={() => {
                                if (card) {
                                  if (card.ownerSeat === member.seat)
                                    selectSource(card);
                                  else {
                                    setTargetCard(card.instanceId);
                                    setTargetSeat(card.ownerSeat);
                                  }
                                } else {
                                  setSlotId(slot.id);
                                  void act(slot.id);
                                }
                              }}
                            >
                              {card ? (
                                <PlayingCard card={renderCard(card)} />
                              ) : (
                                <span>{slotName}</span>
                              )}
                            </button>
                          );
                        },
                      ),
                  )}
                </div>
                <div className="table-deck">
                  <span>{me?.deckCount ?? 0}</span>
                  <small>DECK</small>
                </div>
              </div>
            </div>
            <div className="player-status">
              <b>You</b>
              <strong>
                {me?.health ?? 0} <small>{healthName}</small>
              </strong>
              {resources.enabled && me && <span>{resourceSummary(me.seat)}</span>}
            </div>
            <div className="player-hand" aria-label="Your hand">
              {hand.map((card, index) => (
                <motion.button
                  key={card.id}
                  className={`hand-card ${sourceId === card.instanceId ? "selected" : ""}`}
                  style={{
                    rotate: `${(index - (hand.length - 1) / 2) * 5}deg`,
                  }}
                  whileHover={{ y: -18 }}
                  animate={{ y: sourceId === card.instanceId ? -22 : 0 }}
                  onClick={() => selectSource(card)}
                  disabled={!myTurn || !!reactionWindow || data.pending}
                  aria-label={`Select ${renderCard(card).name} from hand`}
                  aria-pressed={sourceId === card.instanceId}
                >
                  <PlayingCard card={renderCard(card)} />
                </motion.button>
              ))}
            </div>
            <p className="table-instruction">
              {match.status === "finished"
                ? match.winnerSeat === undefined
                  ? "DRAW"
                  : `${nameOf(match.winnerSeat)} WINS`
                : reactionWindow
                  ? myReaction
                    ? "SELECT A TRAP OR PASS"
                    : "WAITING FOR REACTIONS"
                  : myTurn
                    ? "SELECT A CARD OR AN ACTION"
                    : "WAITING FOR YOUR TURN"}
            </p>
          </div>
          <div className="panel match-action-panel">
            <label className="form-label">
              Action
              <select
                aria-label="Match action"
                value={action?.id ?? ""}
                disabled={!canAct || data.pending}
                onChange={(event) => {
                  setActionId(event.target.value);
                  setTargetCard(undefined);
                  setSlotId(undefined);
                }}
              >
                <option value="" disabled>
                  {actions.length
                    ? "Choose action"
                    : myReaction
                      ? "Select an eligible Trap"
                      : "No actions in this phase"}
                </option>
                {actions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                    {resourceCosts(item, item.sourceZone === "none" ? "" : sourceDefinition?.id ?? "", resources,
                      fieldAdjustment({ cards: visible, players }, special, "action_cost", member.seat,
                        item.sourceZone === "none" ? "" : sourceDefinition?.formatId ?? "")
                    ).map(c => ` · ${c.amount} ${resources.pools.find(p => p.id === c.poolId)!.name}`).join("")}
                  </option>
                ))}
              </select>
            </label>
            {action &&
              ["opponent", "any_player"].includes(action.targetKind) && (
                <label className="form-label">
                  Target player
                  <select
                    aria-label="Target player"
                    value={
                      targetSeat ??
                      opponents.find((player) => !player.eliminated)?.seat ??
                      ""
                    }
                    onChange={(event) =>
                      setTargetSeat(Number(event.target.value))
                    }
                  >
                    {players
                      .filter(
                        (player) =>
                          !player.eliminated &&
                          (action.targetKind !== "opponent" ||
                            player.seat !== member.seat),
                      )
                      .map((player) => (
                        <option key={player.seat} value={player.seat}>
                          {nameOf(player.seat)}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            {action &&
              ["own_card", "enemy_card", "any_card"].includes(
                action.targetKind,
              ) && (
                <label className="form-label">
                  Target card
                  <select
                    aria-label="Target card"
                    value={targetCard ?? ""}
                    onChange={(event) =>
                      setTargetCard(
                        event.target.value === ""
                          ? undefined
                          : Number(event.target.value),
                      )
                    }
                  >
                    <option value="">Choose card</option>
                    {eligibleTargets.map((card) => (
                      <option key={card.id} value={card.instanceId}>
                        {renderCard(card).name} · player {card.ownerSeat + 1}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            {action?.kind === "play" && (
              <label className="form-label">
                Field slot
                <select
                  aria-label="Field slot"
                  value={slotId ?? ""}
                  onChange={(event) =>
                    setSlotId(event.target.value || undefined)
                  }
                >
                  <option value="">Choose slot</option>
                  {definition.field.slots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              className="button button-light"
              disabled={!canAct || !action || data.pending}
              onClick={() => void act()}
            >
              {myReaction ? "React" : "Perform action"}
            </button>
            <button
              className="button button-outline"
              disabled={!myTurn || !!reactionWindow || data.pending}
              onClick={() =>
                void data.call((connection) =>
                  connection.reducers.advanceTurnPhase({
                    matchId: match.id,
                    expectedRevision: match.revision,
                  }),
                )
              }
            >
              Next phase
            </button>
            {match.status === "active" && !me?.eliminated && (
              <button
                className="text-button"
                disabled={data.pending}
                onClick={() =>
                  void data.call((connection) =>
                    connection.reducers.concedeMatch({
                      matchId: match.id,
                      expectedRevision: match.revision,
                    }),
                  )
                }
              >
                Concede
              </button>
            )}
            {(match.status === "finished" || me?.eliminated) && (
              <button
                className="text-button"
                onClick={async () => {
                  if (
                    await data.call((connection) =>
                      connection.reducers.leaveRoom({ roomId: room.id }),
                    )
                  )
                    navigate("/rooms");
                }}
              >
                Leave room
              </button>
            )}
          </div>
          <div className="panel match-history" aria-label="Match history">
            {data.history
              .filter((event) => event.matchId === match.id)
              .sort((a, b) => b.revision - a.revision)
              .map((event) => (
                <p key={String(event.id)}>
                  {nameOf(event.seat)} · {event.actionId || event.kind}
                  {event.outcomes
                    .map(
                      (outcome) =>
                        ` · ${outcome.randomId}: ${outcome.coin || outcome.rolls.join(", ")}`,
                    )
                    .join("")}
                </p>
              ))}
          </div>
        </>
      )}
    </>
  );
}
