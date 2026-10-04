export type ResponseItem = {
  type: string;
  name?: string;
  arguments?: string;
  call_id?: string;
  content?: { type: string; text?: string }[];
  [key: string]: unknown;
};
export type GrokResponse = { output: ResponseItem[]; status?: string };
export type GrokOptions = {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
};

export class AgentError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export async function requestGrok(
  options: GrokOptions,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<GrokResponse> {
  if (!options.apiKey || options.apiKey === "your_api_key_here") {
    throw new AgentError(
      "Game designer is not configured. Add XAI_API_KEY to agent/.env and restart the agent server.",
      503,
    );
  }
  const timeout = AbortSignal.timeout(60_000);
  const response = await (options.fetch ?? fetch)(
    "https://api.x.ai/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, model: options.model, store: false }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    },
  );
  if (!response.ok) {
    // Do not expose upstream bodies, credentials or model internals in the browser.
    await response.body?.cancel();
    const messages: Record<number, string> = {
      401: "Grok rejected the API key. Check XAI_API_KEY and restart the agent server.",
      403: "Grok denied access. Check the model and account permissions.",
      404: "The configured Grok model is unavailable. Check XAI_MODEL.",
      429: "Grok reached an account limit. Check API credits and try again later.",
    };
    throw new AgentError(
      messages[response.status] ??
        `Grok request failed (${response.status}). Try again.`,
      response.status === 429 ? 429 : 502,
    );
  }
  const result = (await response.json()) as GrokResponse;
  if (!Array.isArray(result.output))
    throw new AgentError("Grok returned an unexpected response.");
  if (result.status === "failed" || result.status === "incomplete")
    throw new AgentError(
      "Grok could not complete this request. Try a smaller game specification.",
    );
  return result;
}

export function responseText(response: GrokResponse): string {
  return response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text ?? "")
    .join("\n");
}
