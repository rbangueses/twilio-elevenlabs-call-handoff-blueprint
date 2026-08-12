const { createHandler: createStartOutboundHandler } = require("../functions/start_outbound");
const { createHandler: createStartStudioOutboundHandler } = require("../functions/start_studio_outbound");
const { createHandler: createOutboundStatusHandler } = require("../functions/outbound_status");
const { startOutboundCall, startStudioExecution } = require("../lib/twilio-client");

test("startOutboundCall creates a Twilio outbound call with webhook and status callbacks", async () => {
  const create = jest.fn().mockResolvedValue({
    sid: "CA1234567890abcdef1234567890abcdef",
    status: "queued",
  });

  const call = await startOutboundCall({ calls: { create } }, {
    from: "+15551239999",
    to: "+15551230000",
    url: "https://example.twil.io/outbound?HandoffId=outbound-1",
    statusCallback: "https://example.twil.io/outbound_status",
  });

  expect(call.sid).toBe("CA1234567890abcdef1234567890abcdef");
  expect(create).toHaveBeenCalledWith({
    from: "+15551239999",
    to: "+15551230000",
    url: "https://example.twil.io/outbound?HandoffId=outbound-1",
    method: "POST",
    statusCallback: "https://example.twil.io/outbound_status",
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
  });
});

test("/start_outbound authenticates and starts a customer call", async () => {
  const callback = jest.fn();
  const startOutboundCallMock = jest.fn().mockResolvedValue({
    sid: "CA1234567890abcdef1234567890abcdef",
    status: "queued",
  });

  await createStartOutboundHandler({
    loadConfig: () => ({
      handoffToken: "secret",
      twilioPhoneNumber: "+15551239999",
      outboundWebhookUrl: "https://example.twil.io/outbound",
      outboundStatusCallbackUrl: "https://example.twil.io/outbound_status",
    }),
    validateBearerToken: jest.fn(),
    createTwilioClient: () => ({ account: "client" }),
    startOutboundCall: startOutboundCallMock,
  })({}, {
    request: { headers: { authorization: "Bearer secret" } },
    toNumber: "+15551230000",
    handoffId: "outbound-1",
  }, callback);

  expect(callback.mock.calls[0][1]).toEqual({
    ok: true,
    route: "outbound",
    callSid: "CA1234567890abcdef1234567890abcdef",
    status: "queued",
    from: "+15551239999",
    to: "+15551230000",
    handoffId: "outbound-1",
  });
  expect(startOutboundCallMock).toHaveBeenCalledWith({ account: "client" }, {
    from: "+15551239999",
    to: "+15551230000",
    url: "https://example.twil.io/outbound?HandoffId=outbound-1",
    statusCallback: "https://example.twil.io/outbound_status",
  });
});

test("startStudioExecution creates a Studio execution with outbound call parameters", async () => {
  const create = jest.fn().mockResolvedValue({
    sid: "FN1234567890abcdef1234567890abcdef",
    status: "active",
  });

  const execution = await startStudioExecution({
    studio: {
      v2: {
        flows: () => ({
          executions: { create },
        }),
      },
    },
  }, {
    flowSid: "FW1234567890abcdef1234567890abcdef",
    from: "+15551239999",
    to: "+15551230000",
    handoffId: "outbound-studio-1",
  });

  expect(execution.sid).toBe("FN1234567890abcdef1234567890abcdef");
  expect(create).toHaveBeenCalledWith({
    from: "+15551239999",
    to: "+15551230000",
    parameters: {
      handoffId: "outbound-studio-1",
      direction: "outbound",
      customerNumber: "+15551230000",
      twilioNumber: "+15551239999",
    },
  });
});

test("/start_studio_outbound authenticates and starts a Studio-owned customer call", async () => {
  const callback = jest.fn();
  const startStudioExecutionMock = jest.fn().mockResolvedValue({
    sid: "FN1234567890abcdef1234567890abcdef",
    status: "active",
  });

  await createStartStudioOutboundHandler({
    loadConfig: () => ({
      handoffToken: "secret",
      twilioPhoneNumber: "+15551239999",
      studioOutboundFlowSid: "FW1234567890abcdef1234567890abcdef",
    }),
    validateBearerToken: jest.fn(),
    createTwilioClient: () => ({ account: "client" }),
    startStudioExecution: startStudioExecutionMock,
  })({}, {
    request: { headers: { authorization: "Bearer secret" } },
    toNumber: "+15551230000",
    handoffId: "outbound-studio-1",
  }, callback);

  expect(callback.mock.calls[0][1]).toEqual({
    ok: true,
    route: "studio_outbound",
    executionSid: "FN1234567890abcdef1234567890abcdef",
    status: "active",
    flowSid: "FW1234567890abcdef1234567890abcdef",
    from: "+15551239999",
    to: "+15551230000",
    handoffId: "outbound-studio-1",
  });
  expect(startStudioExecutionMock).toHaveBeenCalledWith({ account: "client" }, {
    flowSid: "FW1234567890abcdef1234567890abcdef",
    from: "+15551239999",
    to: "+15551230000",
    handoffId: "outbound-studio-1",
  });
});

test("/outbound_status acknowledges Twilio call progress callbacks", async () => {
  const callback = jest.fn();

  await createOutboundStatusHandler()({}, {
    CallSid: "CA1234567890abcdef1234567890abcdef",
    CallStatus: "in-progress",
    To: "+15551230000",
  }, callback);

  expect(callback.mock.calls[0][1]).toEqual({
    ok: true,
    callSid: "CA1234567890abcdef1234567890abcdef",
    status: "in-progress",
  });
});
