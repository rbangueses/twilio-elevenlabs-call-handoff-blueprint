const {
  buildColdDirectTwiML,
  buildCallerConferenceTwiML,
  buildHumanWarmJoinTwiML,
  createWarmTransferCall,
} = require("../lib/handoff");
const { createHandler } = require("../functions/escalate");

const parentCallSid = "CA1234567890abcdef1234567890abcdef";
const payload = {
  parentCallSid,
  handoffId: "handoff-1",
  intent: "account_access",
  reason: "explicit_request",
  summary: "Caller needs help resetting access.",
  description: "Caller needs help resetting access.",
};

test("buildColdDirectTwiML dials the configured destination", () => {
  const twiml = buildColdDirectTwiML({ directTransferTo: "+15557654321" });

  expect(twiml).toContain("<Dial>+15557654321</Dial>");
});

test("warm transfer TwiML puts caller and human in same conference", () => {
  const callerTwiml = buildCallerConferenceTwiML({ directHoldUrl: "https://example.com/hold.xml" }, payload);
  const humanTwiml = buildHumanWarmJoinTwiML({}, payload);

  expect(callerTwiml).toContain("handoff-handoff-1");
  expect(humanTwiml).toContain("Caller needs help resetting access.");
  expect(humanTwiml).toContain("handoff-handoff-1");
});

test("createWarmTransferCall creates the human call with the warm summary", async () => {
  const create = jest.fn().mockResolvedValue({});
  const client = { calls: { create } };
  const config = {
    directTransferTo: "+15557654321",
    directTransferFrom: "+15551234567",
  };

  await createWarmTransferCall(client, config, payload);

  expect(create).toHaveBeenCalledWith(expect.objectContaining({
    to: "+15557654321",
    from: "+15551234567",
    twiml: expect.stringContaining("Caller needs help resetting access."),
  }));
});

function createDependencies(config) {
  const updateCallWithTwiML = jest.fn().mockResolvedValue({});
  const callsCreate = jest.fn().mockResolvedValue({});
  const client = { calls: Object.assign(() => ({ update: updateCallWithTwiML }), { create: callsCreate }) };

  return {
    loadConfig: () => ({ handoffToken: "secret", ...config }),
    validateBearerToken: jest.fn((headers, expectedToken) => {
      if (headers.authorization !== `Bearer ${expectedToken}`) {
        throw new Error("Unauthorized");
      }
    }),
    normalizeHandoffPayload: jest.fn(() => payload),
    buildTaskrouterTwiML: jest.fn(() => "<Response><Enqueue /></Response>"),
    buildColdDirectTwiML: jest.fn(() => "<Response><Dial>+15557654321</Dial></Response>"),
    buildCallerConferenceTwiML: jest.fn(() => "<Response><Dial><Conference>handoff-handoff-1</Conference></Dial></Response>"),
    createWarmTransferCall: jest.fn().mockResolvedValue(undefined),
    createTwilioClient: jest.fn(() => client),
    updateCallWithTwiML,
    client,
    callsCreate,
  };
}

function authorizedEvent() {
  return { ...payload, request: { headers: { authorization: "Bearer secret" } } };
}

test("/escalate direct cold mode updates payload.parentCallSid with Dial TwiML", async () => {
  const dependencies = createDependencies({ routingMode: "direct", directTransferMode: "cold_dial" });
  const callback = jest.fn();

  await createHandler(dependencies)({}, authorizedEvent(), callback);

  expect(dependencies.updateCallWithTwiML).toHaveBeenCalledWith(
    dependencies.client,
    parentCallSid,
    "<Response><Dial>+15557654321</Dial></Response>",
  );
  expect(dependencies.createWarmTransferCall).not.toHaveBeenCalled();
  expect(callback).toHaveBeenCalledWith(null, { ok: true, route: "direct", handoffId: "handoff-1" });
});

test("/escalate direct warm mode updates the parent call and creates human call with warm summary", async () => {
  const dependencies = createDependencies({ routingMode: "direct", directTransferMode: "warm_conference" });
  const callback = jest.fn();

  await createHandler(dependencies)({}, authorizedEvent(), callback);

  expect(dependencies.updateCallWithTwiML).toHaveBeenCalledWith(
    dependencies.client,
    parentCallSid,
    "<Response><Dial><Conference>handoff-handoff-1</Conference></Dial></Response>",
  );
  expect(dependencies.createWarmTransferCall).toHaveBeenCalledWith(
    dependencies.client,
    expect.objectContaining({ directTransferMode: "warm_conference" }),
    payload,
  );
  expect(callback).toHaveBeenCalledWith(null, { ok: true, route: "direct", handoffId: "handoff-1" });
});

test("/escalate continues to use TaskRouter unless direct routing is selected", async () => {
  const dependencies = createDependencies({ routingMode: "taskrouter" });
  const callback = jest.fn();

  await createHandler(dependencies)({}, authorizedEvent(), callback);

  expect(dependencies.buildTaskrouterTwiML).toHaveBeenCalledWith(expect.any(Object), payload);
  expect(dependencies.updateCallWithTwiML).toHaveBeenCalledWith(
    dependencies.client,
    parentCallSid,
    "<Response><Enqueue /></Response>",
  );
  expect(callback).toHaveBeenCalledWith(null, { ok: true, route: "taskrouter", handoffId: "handoff-1" });
});
