const CALL_SID = /^CA[0-9a-fA-F]{32}$/;

function trimString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeHandoffPayload(input) {
  const parentCallSid = trimString(input.parentCallSid || input.parent_call_sid, 34);
  if (!CALL_SID.test(parentCallSid)) {
    throw new Error("Invalid parentCallSid");
  }

  const rawDirection = trimString(input.direction || input.callDirection || input.call_direction || "inbound", 16);
  const direction = rawDirection === "outbound" ? "outbound" : "inbound";
  const from = trimString(input.from, 32);
  const to = trimString(input.to, 32);
  const customerNumber = trimString(
    input.customerNumber || input.customer_number || (direction === "outbound" ? to : from),
    32,
  );
  const twilioNumber = trimString(
    input.twilioNumber || input.twilio_number || (direction === "outbound" ? from : to),
    32,
  );

  return {
    parentCallSid,
    handoffId: trimString(input.handoffId || input.handoff_id || parentCallSid, 80),
    intent: trimString(input.intent || "general_support", 80),
    reason: trimString(input.reason || "ai_escalation", 80),
    summary: trimString(input.summary, 900),
    description: trimString(input.description || input.summary, 900),
    direction,
    from,
    to,
    customerNumber,
    twilioNumber,
  };
}

function buildTaskAttributes(payload) {
  return {
    type: payload.direction || "inbound",
    reason: "ai_escalation",
    channelType: "voice",
    direction: payload.direction || "inbound",
    intent: payload.intent,
    escalationReason: payload.reason,
    summary: payload.summary,
    description: payload.description,
    parentCallSid: payload.parentCallSid,
    handoffId: payload.handoffId,
    from: payload.from,
    to: payload.to,
    customerNumber: payload.customerNumber,
    twilioNumber: payload.twilioNumber,
  };
}

function buildTaskrouterTwiML(config, payload) {
  const { VoiceResponse } = require("twilio").twiml;
  if (!/^WW[0-9a-fA-F]{32}$/.test(config.flexWorkflowSid)) {
    throw new Error("FLEX_WORKFLOW_SID must be a TaskRouter Workflow SID starting with WW");
  }

  const response = new VoiceResponse();
  const enqueue = response.enqueue({
    workflowSid: config.flexWorkflowSid,
    waitUrl: config.taskrouterWaitUrl || undefined,
  });
  enqueue.task({}, JSON.stringify(buildTaskAttributes(payload)));
  return response.toString();
}

function buildStudioReturnTwiML(config, payload) {
  const { VoiceResponse } = require("twilio").twiml;
  const studioWebhookUrl = payload.direction === "outbound"
    ? config.studioOutboundFlowWebhookUrl
    : config.studioFlowWebhookUrl;
  const requiredEnv = payload.direction === "outbound"
    ? "STUDIO_OUTBOUND_FLOW_WEBHOOK_URL"
    : "STUDIO_FLOW_WEBHOOK_URL";

  if (!studioWebhookUrl) {
    throw new Error(`${requiredEnv} is required for Studio escalation`);
  }

  const url = new URL(studioWebhookUrl);
  url.searchParams.set("FlowEvent", "return");
  url.searchParams.set("route", "flex");
  url.searchParams.set("intent", payload.intent);
  url.searchParams.set("summary", payload.summary);
  url.searchParams.set("description", payload.description);
  url.searchParams.set("parentCallSid", payload.parentCallSid);
  url.searchParams.set("handoffId", payload.handoffId);
  url.searchParams.set("direction", payload.direction);
  url.searchParams.set("customerNumber", payload.customerNumber);
  url.searchParams.set("twilioNumber", payload.twilioNumber);

  const response = new VoiceResponse();
  response.redirect({ method: "POST" }, url.toString());
  return response.toString();
}

module.exports = {
  normalizeHandoffPayload,
  buildTaskAttributes,
  buildTaskrouterTwiML,
  buildStudioReturnTwiML,
};
