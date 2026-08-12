const { buildConversationClientData, registerTwilioCall } = require("../lib/elevenlabs");

test("buildConversationClientData includes handoff metadata as dynamic variables", () => {
  const data = buildConversationClientData({
    CallSid: "CA1234567890abcdef1234567890abcdef",
    From: "+15551230000",
    To: "+15551239999",
  }, { direction: "inbound" });

  expect(data.dynamic_variables.parent_call_sid).toBe("CA1234567890abcdef1234567890abcdef");
  expect(data.dynamic_variables.handoff_id).toBe("CA1234567890abcdef1234567890abcdef");
  expect(data.dynamic_variables.call_direction).toBe("inbound");
  expect(data.dynamic_variables.customer_number).toBe("+15551230000");
  expect(data.dynamic_variables.twilio_number).toBe("+15551239999");
  expect(Object.keys(data.dynamic_variables).sort()).toEqual([
    "call_direction",
    "called_number",
    "caller_number",
    "customer_number",
    "handoff_id",
    "parent_call_sid",
    "twilio_number",
  ]);
});

test("buildConversationClientData maps outbound customer context to the called party", () => {
  const data = buildConversationClientData({
    CallSid: "CA1234567890abcdef1234567890abcdef",
    From: "+15551239999",
    To: "+15551230000",
    HandoffId: "outbound-1",
  }, { direction: "outbound" });

  expect(data.dynamic_variables.parent_call_sid).toBe("CA1234567890abcdef1234567890abcdef");
  expect(data.dynamic_variables.handoff_id).toBe("outbound-1");
  expect(data.dynamic_variables.call_direction).toBe("outbound");
  expect(data.dynamic_variables.customer_number).toBe("+15551230000");
  expect(data.dynamic_variables.twilio_number).toBe("+15551239999");
  expect(data.dynamic_variables.caller_number).toBe("+15551239999");
  expect(data.dynamic_variables.called_number).toBe("+15551230000");
});

test("registerTwilioCall returns TwiML from ElevenLabs", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    text: async () => "<Response><Connect /></Response>",
  });

  const twiml = await registerTwilioCall({
    elevenlabsApiKey: "xi_test",
    elevenlabsAgentId: "agent_123",
  }, {
    fromNumber: "+15551230000",
    toNumber: "+15551239999",
    direction: "inbound",
    conversationInitiationClientData: { dynamic_variables: { parent_call_sid: "CA1234567890abcdef1234567890abcdef" } },
  }, fetchImpl);

  expect(twiml).toContain("<Response>");
  expect(fetchImpl.mock.calls[0][0]).toBe("https://api.elevenlabs.io/v1/convai/twilio/register-call");
});

test("registerTwilioCall gives a clear error when fetch is unavailable", async () => {
  await expect(registerTwilioCall({
    elevenlabsApiKey: "xi_test",
    elevenlabsAgentId: "agent_123",
  }, {}, undefined)).rejects.toThrow("No fetch implementation available");
});
