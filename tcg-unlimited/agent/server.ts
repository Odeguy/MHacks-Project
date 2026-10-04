import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { pathToFileURL } from "node:url";
import { designGame } from "./designer";
import { generateDeck } from "./decks";
import { AgentError, type GrokOptions } from "./grok";

type Config = GrokOptions & { allowedOrigins?: string[] };
export function createAgentServer(config: Config) {
  let active = 0;
  const allowedOrigins = new Set(
    config.allowedOrigins ?? [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4173",
      "http://127.0.0.1:4173",
    ],
  );
  return createServer(async (req, res) => {
    const controller = new AbortController();
    let acquired = false;
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      const origin = req.headers.origin;
      if (origin && !allowedOrigins.has(origin))
        throw new AgentError("Origin is not allowed.", 403);
      // The service intentionally listens on loopback only, including Host validation.
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host ?? ""))
        throw new AgentError("Host is not allowed.", 403);
      if (req.method === "GET" && req.url === "/api/agent/health") {
        send(res, 200, {
          configured: !!config.apiKey && config.apiKey !== "your_api_key_here",
          model: config.model,
        });
        return;
      }
      const deckRequest = req.url === "/api/agent/deck";
      if (req.url !== "/api/agent/design" && !deckRequest)
        throw new AgentError("Not found.", 404);
      if (req.method !== "POST")
        throw new AgentError("Use POST for game generation.", 405);
      if (!req.headers["content-type"]?.startsWith("application/json"))
        throw new AgentError("Send application/json.", 415);
      if (!config.apiKey || config.apiKey === "your_api_key_here")
        throw new AgentError(
          "Game designer is not configured. Add XAI_API_KEY to agent/.env and restart the agent server.",
          503,
        );
      if (active >= 2)
        throw new AgentError(
          "The game designer is busy. Try again shortly.",
          429,
        );
      active++;
      acquired = true;
      const body = (await readBody(req, deckRequest ? 550_000 : 32_000)) as Parameters<typeof generateDeck>[0];
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new AgentError("Send a JSON object.", 400);
      if (!deckRequest && typeof body?.prompt !== "string")
        throw new AgentError("A game description is required.", 400);
      const result = deckRequest
        ? await generateDeck(body, config, controller.signal)
        : await designGame(body.prompt as string, config, controller.signal);
      if (!controller.signal.aborted) send(res, 200, result);
    } catch (error) {
      if (controller.signal.aborted || res.destroyed) return;
      const timeout =
        error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name);
      send(
        res,
        timeout ? 504 : error instanceof AgentError ? error.status : 500,
        {
          error: timeout
            ? "Game generation timed out. Try a smaller game."
            : error instanceof AgentError
              ? error.message
              : "The game designer encountered an error. Try again.",
        },
      );
    } finally {
      if (acquired) active--;
    }
  });
}

async function readBody(req: IncomingMessage, maximum = 32_000): Promise<unknown> {
  let size = 0;
  const parts: Buffer[] = [];
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > maximum) throw new AgentError("Request is too large.", 413);
    parts.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new AgentError("Invalid JSON.", 400);
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.AGENT_PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid AGENT_PORT");
  const server = createAgentServer({
    apiKey: process.env.XAI_API_KEY ?? "",
    model: process.env.XAI_MODEL || "grok-4.7",
    allowedOrigins: process.env.AGENT_ALLOWED_ORIGINS?.split(",").map((s) =>
      s.trim(),
    ),
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(
      `Grok game designer listening at http://127.0.0.1:${port} (${process.env.XAI_API_KEY ? "key configured" : "add XAI_API_KEY to agent/.env"})`,
    ),
  );
}
