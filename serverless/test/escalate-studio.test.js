const { buildStudioReturnTwiML } = require("../lib/handoff");
const { createHandler } = require("../functions/studio_escalate");

const parentCallSid = "CA1234567890abcdef1234567890abcdef";
const payload = {
  parentCallSid,
  handoffId: "handoff-1",
  intent: "account_access",
  reason: "explicit_request",
  summary: "Caller needs a person.",
  description: "Caller needs a person.",
};

test("buildStudioReturnTwiML redirects to Studio FlowEvent return", () => {
  const twiml = buildStudioReturnTwiML({
    studioFlowWebhookUrl: "https://webhooks.twilio.com/v1/Accounts/AC123/Flows/FW123",
  }, payload);

  expect(twiml).toContain("FlowEvent=return");
  expect(twiml).toContain("intent=account_access");
  expect(twiml).toContain(`parentCallSid=${parentCallSid}`);
});

function createDependencies(update) {
  return {
    loadConfig: () => ({
      handoffToken: "secret",
      studioFlowWebhookUrl: "https://webhooks.twilio.com/v1/Accounts/AC123/Flows/FW123",
    }),
    validateBearerToken: jest.fn((headers, expectedToken) => {
      if (headers.authorization !== `Bearer ${expectedToken}`) {
        throw new Error("Unauthorized");
      }
    }),
    normalizeHandoffPayload: jest.fn(() => payload),
    buildStudioReturnTwiML: jest.fn(() => "<Response><Redirect /></Response>"),
    createTwilioClient: jest.fn(() => ({ calls: () => ({ update }) })),
    updateCallWithTwiML: jest.fn((client, callSid, twiml) => client.calls(callSid).update({ twiml })),
  };
}

test("/studio_escalate updates payload.parentCallSid when authorized", async () => {
  const update = jest.fn().mockResolvedValue({});
  const dependencies = createDependencies(update);
  const callback = jest.fn();
  const event = { ...payload, request: { headers: { authorization: "Bearer secret" } } };

  await createHandler(dependencies)({}, event, callback);

  expect(dependencies.updateCallWithTwiML).toHaveBeenCalledWith(
    expect.any(Object),
    parentCallSid,
    "<Response><Redirect /></Response>",
  );
  expect(callback).toHaveBeenCalledWith(null, {
    ok: true,
    route: "studio",
    handoffId: "handoff-1",
  });
});

test("/studio_escalate does not update a call when unauthorized", async () => {
  const update = jest.fn().mockResolvedValue({});
  const dependencies = createDependencies(update);
  const callback = jest.fn();
  const event = { ...payload, request: { headers: { authorization: "Bearer wrong" } } };

  await createHandler(dependencies)({}, event, callback);

  expect(dependencies.updateCallWithTwiML).not.toHaveBeenCalled();
  expect(callback).toHaveBeenCalledWith(null, { ok: false, error: "Unauthorized" });
});
