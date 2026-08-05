const { buildTaskrouterTwiML } = require("../lib/handoff");
const { updateCallWithTwiML } = require("../lib/twilio-client");
const { createHandler } = require("../functions/escalate");

const parentCallSid = "CA1234567890abcdef1234567890abcdef";
const workflowSid = "WW1234567890abcdef1234567890abcdef";
const payload = {
  parentCallSid,
  handoffId: "handoff-1",
  intent: "billing",
  reason: "explicit_request",
  summary: "Caller asked for billing help.",
  description: "Caller asked for billing help.",
  from: "+15551230000",
  to: "+15551239999",
};

test("buildTaskrouterTwiML enqueues the call into the configured workflow", () => {
  const twiml = buildTaskrouterTwiML({
    flexWorkflowSid: workflowSid,
    taskrouterWaitUrl: "https://example.com/wait.xml",
  }, payload);

  expect(twiml).toContain(`workflowSid="${workflowSid}"`);
  expect(twiml).toContain("Caller asked for billing help.");
  expect(twiml).toContain("<Task>");
});

test("updateCallWithTwiML updates the specified call", async () => {
  const update = jest.fn().mockResolvedValue({});
  const client = { calls: () => ({ update }) };

  await updateCallWithTwiML(client, parentCallSid, "<Response />");

  expect(update).toHaveBeenCalledWith({ twiml: "<Response />" });
});

function createDependencies(update) {
  return {
    loadConfig: () => ({ handoffToken: "secret", flexWorkflowSid: workflowSid }),
    validateBearerToken: jest.fn((headers, expectedToken) => {
      if (headers.authorization !== `Bearer ${expectedToken}`) {
        throw new Error("Unauthorized");
      }
    }),
    normalizeHandoffPayload: jest.fn(() => payload),
    buildTaskrouterTwiML: jest.fn(() => "<Response><Enqueue /></Response>"),
    createTwilioClient: jest.fn(() => ({ calls: () => ({ update }) })),
    updateCallWithTwiML: jest.fn((client, callSid, twiml) => client.calls(callSid).update({ twiml })),
  };
}

test("/escalate updates the original parent call with Enqueue TwiML when authorized", async () => {
  const update = jest.fn().mockResolvedValue({});
  const dependencies = createDependencies(update);
  const callback = jest.fn();
  const event = { ...payload, request: { headers: { authorization: "Bearer secret" } } };

  await createHandler(dependencies)({}, event, callback);

  expect(dependencies.updateCallWithTwiML).toHaveBeenCalledWith(
    expect.any(Object),
    parentCallSid,
    "<Response><Enqueue /></Response>",
  );
  expect(callback).toHaveBeenCalledWith(null, {
    ok: true,
    route: "taskrouter",
    handoffId: "handoff-1",
  });
});

test("/escalate does not update a call when unauthorized", async () => {
  const update = jest.fn().mockResolvedValue({});
  const dependencies = createDependencies(update);
  const callback = jest.fn();
  const event = { ...payload, request: { headers: { authorization: "Bearer wrong" } } };

  await createHandler(dependencies)({}, event, callback);

  expect(dependencies.updateCallWithTwiML).not.toHaveBeenCalled();
  expect(callback).toHaveBeenCalledWith(null, { ok: false, error: "Unauthorized" });
});
