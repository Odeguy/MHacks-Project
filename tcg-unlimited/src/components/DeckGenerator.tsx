import { useEffect, useRef, useState } from "react";
import { cardKey, useGameData } from "../GameDataContext";
import { validateDeck } from "../../spacetimedb/src/validation";
import type { DeckEntry } from "../../spacetimedb/src/contracts";
import { agentEndpoint } from "../agent-api";

export default function DeckGenerator({
  gameId,
  versionId,
  onSaved,
}: {
  gameId: string;
  versionId?: bigint;
  onSaved?: (id: string) => void | Promise<void>;
}) {
  const data = useGameData();
  const version = data.versions.find(
    (row) => row.id === (versionId ?? data.gameById(gameId)?.versionId),
  );
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const request = useRef<AbortController>();
  useEffect(() => {
    setBusy(false);
    setSaving(false);
    setError("");
    setResult("");
    return () => {
      request.current?.abort();
      request.current = undefined;
    };
  }, [gameId, version?.id]);

  async function generate() {
    if (!version) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setResult("");
    try {
      const response = await fetch(agentEndpoint("deck"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          definition: version.definition,
          rules: data.versionRuleRows.find(
            (row) => row.versionId === version.id,
          )?.rules,
          special: data.versionSpecialRows.find(
            (row) => row.versionId === version.id,
          )?.rules,
          resources: data.versionResourceRows.find(
            (row) => row.versionId === version.id,
          )?.rules,
        }),
        signal: controller.signal,
      });
      const generated = (await response.json()) as {
        name: string;
        entries: DeckEntry[];
        explanation: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(generated.error || "Deck generation failed.");
      if (
        typeof generated.name !== "string" ||
        !generated.name.trim() ||
        generated.name.length > 60
      )
        throw new Error("The generator returned an invalid deck name.");
      validateDeck(version.definition, generated.entries, true);
      if (controller.signal.aborted || request.current !== controller) return;
      setSaving(true);
      const id = await data.saveDeck({
        gameId,
        versionId: version.id,
        name: generated.name,
        entries: Object.fromEntries(
          generated.entries.map((entry) => [
            cardKey(version.id, entry.cardId),
            entry.quantity,
          ]),
        ),
      });
      if (!id) throw new Error("The deck could not be saved. Try again.");
      if (controller.signal.aborted || request.current !== controller) return;
      setResult(`${generated.name} saved. ${generated.explanation ?? ""}`);
      await onSaved?.(id);
    } catch (cause) {
      if (!controller.signal.aborted && request.current === controller)
        setError(
          cause instanceof SyntaxError || cause instanceof TypeError
            ? "The deck generator is unavailable. Try again later."
            : cause instanceof Error
              ? cause.message
              : "Deck generation failed.",
        );
    } finally {
      if (request.current === controller) {
        request.current = undefined;
        setBusy(false);
        setSaving(false);
      }
    }
  }
  return (
    <section className="deck-generator" aria-label="Deck generator">
      <label className="form-label">
        Deck idea (optional)
        <input
          value={prompt}
          maxLength={2000}
          disabled={busy}
          placeholder="Leave blank for a surprise deck"
          onChange={(event) => setPrompt(event.target.value)}
        />
      </label>
      <div className="library-actions">
        <button
          className="button button-outline"
          disabled={!data.ready || data.pending || busy || !version}
          onClick={() => void generate()}
        >
          {saving ? "Saving…" : busy ? "Generating…" : "Generate deck"}
        </button>
        {busy && !saving && (
          <button
            className="button button-outline"
            onClick={() => {
              request.current?.abort();
              request.current = undefined;
              setBusy(false);
            }}
          >
            Cancel
          </button>
        )}
      </div>
      {busy && (
        <p role="status">
          {saving
            ? "Saving your deck."
            : "Choosing cards and checking deck limits…"}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {result && <p role="status">{result}</p>}
    </section>
  );
}
