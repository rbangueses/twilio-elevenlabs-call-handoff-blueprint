const { createHandler: createVoiceHandler } = require("../functions/voice");
const { createHandler: createStudioVoiceHandler } = require("../functions/studio_voice");
const { createHandler: createOutboundHandler } = require("../functions/outbound");

function testDependencies() {
  return {
    loadConfig: (context) => ({
      elevenlabsApiKey: context.ELEVENLABS_API_KEY,
      elevenlabsAgentId: context.ELEVENLABS_AGENT_ID,
    }),
    buildConversationClientData: jest.fn(() => ({ dynamic_variables: {} })),
    registerTwilioCall: jest.fn().mockResolvedValue("<Response><Connect /></Response>"),
    createXmlResponse: (body) => ({ toString: () => body }),
    createUnavailableResponse: () => ({ toString: () => "<Response><Say>Unavailable</Say></Response>" }),
  };
}

const context = {
  ELEVENLABS_AGENT_ID: "agent_123",
  ELEVENLABS_API_KEY: "xi_test",
  HANDOFF_TOKEN: "secret",
};
const event = {
  CallSid: "CA1234567890abcdef1234567890abcdef",
  From: "+15551230000",
  To: "+15551239999",
};

test("/voice returns ElevenLabs TwiML as XML", async () => {
  const callback = jest.fn();
  const dependencies = testDependencies();

  await createVoiceHandler(dependencies)(context, event, callback);

  expect(callback.mock.calls[0][1].toString()).toContain("<Response>");
  expect(dependencies.registerTwilioCall).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
    direction: "inbound",
  }));
  expect(dependencies.buildConversationClientData).toHaveBeenCalledWith(event);
});

test("/studio_voice uses the same parent call metadata shape", async () => {
  const callback = jest.fn();
  const dependencies = testDependencies();

  await createStudioVoiceHandler(dependencies)(context, event, callback);

  expect(callback.mock.calls[0][1].toString()).toContain("<Response>");
  expect(dependencies.buildConversationClientData).toHaveBeenCalledWith(event);
});

test("/outbound registers outbound Twilio calls", async () => {
  const callback = jest.fn();
  const dependencies = testDependencies();

  await createOutboundHandler(dependencies)(context, event, callback);

  expect(callback.mock.calls[0][1].toString()).toContain("<Response>");
  expect(dependencies.registerTwilioCall).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
    direction: "outbound",
    fromNumber: event.From,
    toNumber: event.To,
  }));
});
