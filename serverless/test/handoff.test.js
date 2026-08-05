const { normalizeHandoffPayload, buildTaskAttributes } = require("../lib/handoff");

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
  });

  expect(attrs.reason).toBe("ai_escalation");
  expect(attrs.parentCallSid).toMatch(/^CA/);
  expect(Object.keys(attrs).every((key) => !key.includes("-"))).toBe(true);
});
