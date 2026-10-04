export function hostingFromEnvironment(
  env: Record<string, string | undefined>,
) {
  const render = env.RENDER === "true";
  const port = Number(env.PORT ?? env.AGENT_PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid agent port");
  const allowedOrigins = env.AGENT_ALLOWED_ORIGINS?.split(",")
    .filter((value) => value.trim())
    .map((value) => {
      const url = new URL(value.trim());
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error("AGENT_ALLOWED_ORIGINS must contain HTTP(S) origins");
      return url.origin;
    });
  if (render && !allowedOrigins?.length)
    throw new Error("Set AGENT_ALLOWED_ORIGINS to your Static Site URL");
  return {
    port,
    host: env.AGENT_HOST ?? (render ? "0.0.0.0" : "127.0.0.1"),
    allowedOrigins,
    allowedHosts: [
      env.RENDER_EXTERNAL_HOSTNAME,
      ...(env.AGENT_ALLOWED_HOSTS?.split(",") ?? []),
    ]
      .filter((value): value is string => !!value?.trim())
      .map((value) => value.trim().toLowerCase()),
  };
}
