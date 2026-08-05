const { loadConfig, requireEnv } = require("../lib/config");

test("loadConfig normalizes routing mode defaults", () => {
  const config = loadConfig({
    ELEVENLABS_AGENT_ID: "agent_123",
    ELEVENLABS_API_KEY: "xi_test",
    HANDOFF_TOKEN: "secret",
    ROUTING_MODE: "",
  });

  expect(config.routingMode).toBe("taskrouter");
  expect(config.elevenlabsAgentId).toBe("agent_123");
});

test("requireEnv reports all missing keys", () => {
  const config = loadConfig({});

  expect(() => requireEnv(config, ["ELEVENLABS_AGENT_ID", "HANDOFF_TOKEN"]))
    .toThrow("Missing required environment variables: ELEVENLABS_AGENT_ID, HANDOFF_TOKEN");
});
