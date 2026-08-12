function buildConversationClientData(event, options = {}) {
  const parentCallSid = event.CallSid;
  const direction = options.direction || event.CallDirection || event.call_direction || "inbound";
  const callerNumber = event.From || "";
  const calledNumber = event.To || "";
  const customerNumber = direction === "outbound" ? calledNumber : callerNumber;
  const twilioNumber = direction === "outbound" ? callerNumber : calledNumber;

  return {
    type: "conversation_initiation_client_data",
    dynamic_variables: {
      parent_call_sid: parentCallSid,
      handoff_id: event.HandoffId || parentCallSid,
      call_direction: direction,
      caller_number: callerNumber,
      called_number: calledNumber,
      customer_number: customerNumber,
      twilio_number: twilioNumber,
    },
  };
}

async function registerTwilioCall(config, params, fetchImpl) {
  const request = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!request) {
    throw new Error("No fetch implementation available for ElevenLabs register-call");
  }

  const response = await request("https://api.elevenlabs.io/v1/convai/twilio/register-call", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "xi-api-key": config.elevenlabsApiKey,
    },
    body: JSON.stringify({
      agent_id: config.elevenlabsAgentId,
      from_number: params.fromNumber,
      to_number: params.toNumber,
      direction: params.direction,
      conversation_initiation_client_data: params.conversationInitiationClientData,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`ElevenLabs register-call failed with ${response.status}: ${body.slice(0, 300)}`);
  }
  return body;
}

module.exports = { buildConversationClientData, registerTwilioCall };
