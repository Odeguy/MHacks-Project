import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AgentDesigner from "./AgentDesigner";
import { newDocument } from "../designer-model";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("agent draft review", () => {
  it("previews generation and applies it only after the player chooses to", async () => {
    const document = newDocument();
    document.name = "Generated duel";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        document,
        summary: "6 cards · 3 phases · 2 players",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onApply = vi.fn();
    render(<AgentDesigner onApply={onApply} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Game idea" }), {
      target: { value: "Make a fantasy duel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate game" }));
    await screen.findByText("Generated duel");
    expect(onApply).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/agent/design");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      prompt: "Make a fantasy duel",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Use generated draft" }),
    );
    expect(onApply).toHaveBeenCalledWith(document);
  });

  it("keeps the editor intact on generation errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Game designer is not configured." }),
      }),
    );
    const onApply = vi.fn();
    render(<AgentDesigner onApply={onApply} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Game idea" }), {
      target: { value: "Duel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate game" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "not configured",
    );
    expect(onApply).not.toHaveBeenCalled();
  });

  it("aborts cancelled generation and ignores a late result", async () => {
    let resolve!: (value: unknown) => void;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentDesigner onApply={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Game idea" }), {
      target: { value: "Duel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate game" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    resolve({
      ok: true,
      json: async () => ({ document: newDocument(), summary: "Late result" }),
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Generate game" }),
      ).toBeEnabled(),
    );
    expect(screen.queryByText("Late result")).not.toBeInTheDocument();
  });
});
