const { loadConfig, requireEnv } = require("../lib/config");

test("loadConfig includes shared ElevenLabs and Twilio settings", () => {
  const config = loadConfig({
    ELEVENLABS_AGENT_ID: "agent_123",
    ELEVENLABS_API_KEY: "xi_test",
    HANDOFF_TOKEN: "secret",
    MEMORY_STORE_ID: "mem_store_0123456789abcdefghijklmnop",
    MEMORY_RECALL_OBSERVATIONS_LIMIT: "7",
    MEMORY_RECALL_SUMMARIES_LIMIT: "3",
  });

  expect(config.elevenlabsAgentId).toBe("agent_123");
  expect(config.memoryStoreId).toBe("mem_store_0123456789abcdefghijklmnop");
  expect(config.memoryIdType).toBe("phone");
  expect(config.memoryRecallObservationsLimit).toBe(7);
  expect(config.memoryRecallSummariesLimit).toBe(3);
});

test("requireEnv reports all missing keys", () => {
  const config = loadConfig({});

  expect(() => requireEnv(config, ["ELEVENLABS_AGENT_ID", "HANDOFF_TOKEN"]))
    .toThrow("Missing required environment variables: ELEVENLABS_AGENT_ID, HANDOFF_TOKEN");
});
