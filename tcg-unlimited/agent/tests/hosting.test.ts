import { describe, expect, it } from "vitest";
import { hostingFromEnvironment } from "../hosting";

describe("agent hosting", () => {
  it("keeps local development on loopback with the configured agent port", () => {
    expect(hostingFromEnvironment({})).toMatchObject({
      port: 8787,
      host: "127.0.0.1",
      allowedOrigins: undefined,
    });
    expect(hostingFromEnvironment({ AGENT_PORT: "8788" }).port).toBe(8788);
  });
  it("binds to Render's public interface/PORT and normalizes allowed origins", () => {
    expect(
      hostingFromEnvironment({
        RENDER: "true",
        PORT: "10000",
        AGENT_PORT: "8787",
        RENDER_EXTERNAL_HOSTNAME: "tcg-unlimited-agent.onrender.com",
        AGENT_ALLOWED_ORIGINS: " https://tcg-unlimited.onrender.com/ ",
      }),
    ).toEqual({
      port: 10000,
      host: "0.0.0.0",
      allowedHosts: ["tcg-unlimited-agent.onrender.com"],
      allowedOrigins: ["https://tcg-unlimited.onrender.com"],
    });
  });
  it("refuses invalid ports or a Render deployment without an allowed frontend", () => {
    expect(() => hostingFromEnvironment({ PORT: "abc" })).toThrow("port");
    expect(() => hostingFromEnvironment({ PORT: "65536" })).toThrow("port");
    expect(() => hostingFromEnvironment({ RENDER: "true" })).toThrow(
      "AGENT_ALLOWED_ORIGINS",
    );
    expect(() =>
      hostingFromEnvironment({ AGENT_ALLOWED_ORIGINS: "file:///etc/passwd" }),
    ).toThrow("HTTP(S)");
  });
});
