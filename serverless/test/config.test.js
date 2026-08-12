const { loadConfig, requireEnv } = require("../lib/config");

test("loadConfig includes shared ElevenLabs and Twilio settings", () => {
  const config = loadConfig({
    ELEVENLABS_AGENT_ID: "agent_123",
    ELEVENLABS_API_KEY: "xi_test",
    HANDOFF_TOKEN: "secret",
    STUDIO_OUTBOUND_FLOW_SID: "FW1234567890abcdef1234567890abcdef",
    STUDIO_OUTBOUND_FLOW_WEBHOOK_URL: "https://webhooks.twilio.com/v1/Accounts/AC123/Flows/FW1234567890abcdef1234567890abcdef",
    OUTBOUND_WEBHOOK_URL: "https://example.twil.io/outbound",
    OUTBOUND_STATUS_CALLBACK_URL: "https://example.twil.io/outbound_status",
    MEMORY_STORE_ID: "mem_store_0123456789abcdefghijklmnop",
    MEMORY_RECALL_OBSERVATIONS_LIMIT: "7",
    MEMORY_RECALL_SUMMARIES_LIMIT: "3",
  });

  expect(config.elevenlabsAgentId).toBe("agent_123");
  expect(config.studioOutboundFlowSid).toBe("FW1234567890abcdef1234567890abcdef");
  expect(config.studioOutboundFlowWebhookUrl).toBe("https://webhooks.twilio.com/v1/Accounts/AC123/Flows/FW1234567890abcdef1234567890abcdef");
  expect(config.outboundWebhookUrl).toBe("https://example.twil.io/outbound");
  expect(config.outboundStatusCallbackUrl).toBe("https://example.twil.io/outbound_status");
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
