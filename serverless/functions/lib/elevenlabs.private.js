function buildConversationClientData(event, routingMode) {
  const parentCallSid = event.CallSid;
  return {
    type: "conversation_initiation_client_data",
    dynamic_variables: {
      parent_call_sid: parentCallSid,
      handoff_id: event.HandoffId || parentCallSid,
      routing_mode: routingMode,
      caller_number: event.From || "",
      called_number: event.To || "",
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
