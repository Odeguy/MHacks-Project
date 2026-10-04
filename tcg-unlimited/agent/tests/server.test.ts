import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { request, type Server } from "node:http";
import { createAgentServer } from "../server";
import { mockGrok, fixtureDocument, call } from "./fixtures";

const servers: Server[] = [];
async function start(apiKey = "test-key", fetchMock = mockGrok(), config: Partial<Parameters<typeof createAgentServer>[0]> = {}) {
  const server = createAgentServer({
    apiKey,
    model: "test-model",
    fetch: fetchMock,
    ...config,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/agent`;
}
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        }),
    ),
  );
});

describe("agent HTTP service", () => {
  it("accepts the Render hostname and serves allowed cross-origin preflights, responses and errors", async () => {
    let calls = 0;
    const upstream = mockGrok();
    const origin = "https://tcg-unlimited.onrender.com";
    const hostname = "tcg-unlimited-agent.onrender.com";
    const url = await start("test-key", (async (...args) => {
      calls++;
      return upstream(...args);
    }) as typeof fetch, { allowedOrigins: [origin], allowedHosts: [hostname] });
    for (const path of ["design", "deck"]) {
      const preflight = await fetch(`${url}/${path}`, { method: "OPTIONS", headers: {
        Host: hostname, Origin: origin, "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      } });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
      expect(preflight.headers.get("access-control-allow-headers")).toBe("Content-Type");
      expect(preflight.headers.get("vary")).toBe("Origin");
    }
    expect(calls).toBe(0);
    const response = await fetch(`${url}/design`, { method: "POST", headers: {
      Host: hostname, Origin: origin, "Content-Type": "application/json",
    }, body: JSON.stringify({ prompt: "Make a duel" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect((await response.json()).document.name).toBe("Pocket duel");
    const invalid = await fetch(`${url}/design`, { method: "POST", headers: {
      Host: hostname, Origin: origin, "Content-Type": "application/json",
    }, body: "{}" });
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("access-control-allow-origin")).toBe(origin);
    expect((await fetch(`${url}/health`, { headers: { Host: hostname } })).status).toBe(200);
  });
  it("rejects unexpected cross-site origins and preflight methods/headers", async () => {
    const origin = "https://tcg-unlimited.onrender.com";
    const url = await start("test-key", mockGrok(), { allowedOrigins: [origin] });
    const rejected = await fetch(`${url}/design`, { method: "OPTIONS", headers: {
      Origin: "https://another-site.example", "Access-Control-Request-Method": "POST",
    } });
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get("access-control-allow-origin")).toBeNull();
    expect((await fetch(`${url}/design`, { method: "OPTIONS", headers: {
      Origin: origin, "Access-Control-Request-Method": "DELETE",
    } })).status).toBe(405);
    expect((await fetch(`${url}/deck`, { method: "OPTIONS", headers: {
      Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-unknown",
    } })).status).toBe(403);
  });
  it("validates generated decks through the HTTP route and rejects missing game context", async () => {
    const document = fixtureDocument();
    const deck = { name: "Patrol", explanation: "Balanced cards", entries: document.definition.cards.map(card => ({ cardId: card.id, quantity: 2 })) };
    const url = await start("test-key", (async () => new Response(JSON.stringify({ output: [call("finish_deck", deck, 1)] }))) as typeof fetch);
    const response = await fetch(`${url}/deck`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(document),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(deck);
    expect((await fetch(`${url}/deck`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(400);
  });
  it("returns a validated editor document without exposing credentials", async () => {
    const url = await start();
    const response = await fetch(`${url}/design`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:4173",
      },
      body: JSON.stringify({ prompt: "Make a duel" }),
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.document.name).toBe("Pocket duel");
    expect(JSON.stringify(result)).not.toContain("test-key");
    expect(
      (await fetch(`${url}/health`).then((r) => r.json())).configured,
    ).toBe(true);
  });

  it("starts without a key and returns an actionable configuration error", async () => {
    const url = await start("");
    expect(
      (await fetch(`${url}/health`).then((r) => r.json())).configured,
    ).toBe(false);
    const response = await fetch(`${url}/design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Duel" }),
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("agent/.env");
  });

  it("rejects untrusted origins, unexpected hosts, malformed JSON and oversized prompts", async () => {
    const url = await start();
    expect(
      (
        await fetch(`${url}/health`, {
          headers: { Origin: "https://untrusted.example" },
        })
      ).status,
    ).toBe(403);
    const hostStatus = await new Promise<number | undefined>(
      (resolve, reject) => {
        const req = request(
          `${url}/health`,
          { headers: { Host: "untrusted.example" } },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        );
        req.on("error", reject);
        req.end();
      },
    );
    expect(hostStatus).toBe(403);
    expect(
      (
        await fetch(`${url}/design`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${url}/design`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: "x".repeat(6001) }),
        })
      ).status,
    ).toBe(400);
    expect((await fetch(`${url}/design`)).status).toBe(405);
  });
});
