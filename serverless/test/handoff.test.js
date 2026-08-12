const { normalizeHandoffPayload, buildTaskAttributes, buildStudioReturnTwiML } = require("../lib/handoff");

test("normalizeHandoffPayload validates parent CallSid and summary", () => {
  const payload = normalizeHandoffPayload({
    parentCallSid: "CA1234567890abcdef1234567890abcdef",
    handoffId: "handoff-1",
    intent: "account_access",
    summary: "Caller cannot sign in after requesting a new code.",
    reason: "explicit_request",
  });

  expect(payload.parentCallSid).toBe("CA1234567890abcdef1234567890abcdef");
  expect(payload.intent).toBe("account_access");
});

test("buildTaskAttributes uses TaskRouter-safe keys", () => {
  const attrs = buildTaskAttributes({
    parentCallSid: "CA1234567890abcdef1234567890abcdef",
    handoffId: "handoff-1",
    intent: "account_access",
    summary: "Caller cannot sign in.",
    reason: "explicit_request",
    from: "+15551230000",
    to: "+15551239999",
    direction: "outbound",
    customerNumber: "+15551230000",
    twilioNumber: "+15551239999",
  });

  expect(attrs.reason).toBe("ai_escalation");
  expect(attrs.type).toBe("outbound");
  expect(attrs.direction).toBe("outbound");
  expect(attrs.customerNumber).toBe("+15551230000");
  expect(attrs.twilioNumber).toBe("+15551239999");
  expect(attrs.parentCallSid).toMatch(/^CA/);
  expect(Object.keys(attrs).every((key) => !key.includes("-"))).toBe(true);
});

test("normalizeHandoffPayload defaults unknown directions to inbound", () => {
  const payload = normalizeHandoffPayload({
    parentCallSid: "CA1234567890abcdef1234567890abcdef",
    direction: "sideways",
    from: "+15551230000",
    to: "+15551239999",
  });

  expect(payload.direction).toBe("inbound");
  expect(payload.customerNumber).toBe("+15551230000");
  expect(payload.twilioNumber).toBe("+15551239999");
});

test("buildStudioReturnTwiML returns outbound calls to the outbound Studio flow webhook", () => {
  const twiml = buildStudioReturnTwiML({
    studioFlowWebhookUrl: "https://webhooks.twilio.com/v1/Accounts/AC111/Flows/FWinbound",
    studioOutboundFlowWebhookUrl: "https://webhooks.twilio.com/v1/Accounts/AC111/Flows/FWoutbound",
  }, {
    parentCallSid: "CA1234567890abcdef1234567890abcdef",
    handoffId: "outbound-studio-1",
    intent: "account_access",
    reason: "automation_limit",
    summary: "The customer needs account help.",
    description: "The customer needs account help.",
    direction: "outbound",
    customerNumber: "+15551230000",
    twilioNumber: "+15551239999",
  });

  expect(twiml).toContain("FWoutbound");
  expect(twiml).not.toContain("FWinbound");
  expect(twiml).toContain("FlowEvent=return");
  expect(twiml).toContain("direction=outbound");
});
