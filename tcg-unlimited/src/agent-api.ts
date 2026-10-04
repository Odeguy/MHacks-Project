// Set this on the Static Site to use the separately hosted agent service.
// An empty value keeps the existing local Vite proxy.
export function agentEndpoint(
  path: string,
  base = import.meta.env.VITE_AGENT_URL ?? "",
) {
  return `${base.trim().replace(/\/+$/, "")}/api/agent/${path}`;
}
