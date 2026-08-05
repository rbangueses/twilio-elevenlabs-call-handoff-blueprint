const CALL_SID = /^CA[0-9a-fA-F]{32}$/;

function trimString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeHandoffPayload(input) {
  const parentCallSid = trimString(input.parentCallSid || input.parent_call_sid, 34);
  if (!CALL_SID.test(parentCallSid)) {
    throw new Error("Invalid parentCallSid");
  }

  return {
    parentCallSid,
    handoffId: trimString(input.handoffId || input.handoff_id || parentCallSid, 80),
    intent: trimString(input.intent || "general_support", 80),
    reason: trimString(input.reason || "ai_escalation", 80),
    summary: trimString(input.summary, 900),
    description: trimString(input.description || input.summary, 900),
    from: trimString(input.from, 32),
    to: trimString(input.to, 32),
  };
}

function buildTaskAttributes(payload) {
  return {
    type: "inbound",
    reason: "ai_escalation",
    channelType: "voice",
    intent: payload.intent,
    escalationReason: payload.reason,
    summary: payload.summary,
    description: payload.description,
    parentCallSid: payload.parentCallSid,
    handoffId: payload.handoffId,
    from: payload.from,
    to: payload.to,
  };
}

module.exports = { normalizeHandoffPayload, buildTaskAttributes };
