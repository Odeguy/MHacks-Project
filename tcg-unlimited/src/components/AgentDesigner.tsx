import { useEffect, useRef, useState } from "react";
import type { DesignerDocument } from "../designer-model";

type GeneratedDraft = { document: DesignerDocument; summary: string };

export default function AgentDesigner({
  onApply,
  disabled = false,
}: {
  onApply: (document: DesignerDocument) => void;
  disabled?: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedDraft>();
  const [error, setError] = useState("");
  const request = useRef<AbortController>();

  useEffect(
    () => () => {
      request.current?.abort();
      request.current = undefined;
    },
    [],
  );

  const generate = async () => {
    const controller = new AbortController();
    request.current = controller;
    setGenerating(true);
    setGenerated(undefined);
    setError("");
    try {
      const response = await fetch("/api/agent/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
        signal: controller.signal,
      });
      const result = (await response.json()) as GeneratedDraft & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "Game generation failed.");
      if (
        !result.document?.definition ||
        !result.document?.rules ||
        !result.document?.special ||
        !result.document?.resources
      )
        throw new Error("The designer returned an incomplete draft.");
      if (request.current === controller && !controller.signal.aborted)
        setGenerated(result);
    } catch (cause) {
      if (request.current === controller && !controller.signal.aborted) {
        setError(
          cause instanceof SyntaxError || cause instanceof TypeError
            ? "The game designer is unavailable. Try again later."
            : cause instanceof Error
              ? cause.message
              : "Game generation failed.",
        );
      }
    } finally {
      if (request.current === controller) {
        request.current = undefined;
        setGenerating(false);
      }
    }
  };

  const cancel = () => {
    request.current?.abort();
    request.current = undefined;
    setGenerating(false);
  };

  return (
    <details className="creation-agent" open>
      <summary>Design with Grok</summary>
      <label className="form-label">
        Game idea
        <textarea
          rows={3}
          maxLength={6000}
          value={prompt}
          disabled={generating}
          placeholder="Two players, 20 health, fighters and instant effects. Draw once and play twice in Main, then attack once."
          onChange={(event) => setPrompt(event.target.value)}
        />
      </label>
      <div className="creation-agent-actions">
        <button
          className="button button-outline"
          disabled={disabled || generating || !prompt.trim()}
          onClick={() => void generate()}
        >
          {generating ? "Designing…" : "Generate game"}
        </button>
        {generating && (
          <button className="button button-outline" onClick={cancel}>
            Cancel
          </button>
        )}
      </div>
      {generating && (
        <p role="status">
          Building and checking the rules. This may take a few minutes.
        </p>
      )}
      {error && (
        <p className="creation-agent-error" role="alert">
          {error}
        </p>
      )}
      {generated && (
        <div className="creation-agent-result">
          <p role="status">
            <strong>{generated.document.name}</strong>
            <br />
            {generated.summary}
          </p>
          <div className="creation-agent-actions">
            <button
              className="button button-light"
              disabled={disabled}
              onClick={() => {
                onApply(generated.document);
                setGenerated(undefined);
              }}
            >
              Use generated draft
            </button>
            <button
              className="button button-outline"
              onClick={() => setGenerated(undefined)}
            >
              Discard
            </button>
          </div>
          <small>
            Replaces the editor workspace. Saved drafts stay in your library.
          </small>
        </div>
      )}
    </details>
  );
}
