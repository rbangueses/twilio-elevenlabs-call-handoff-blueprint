function createTwilioClient(config) {
  const twilio = require("twilio");
  return twilio(config.twilioAccountSid, config.twilioAuthToken);
}

async function updateCallWithTwiML(client, callSid, twiml) {
  await client.calls(callSid).update({ twiml });
}

async function startOutboundCall(client, params) {
  const callOptions = {
    from: params.from,
    to: params.to,
    url: params.url,
    method: "POST",
  };

  if (params.statusCallback) {
    callOptions.statusCallback = params.statusCallback;
    callOptions.statusCallbackMethod = "POST";
    callOptions.statusCallbackEvent = ["initiated", "ringing", "answered", "completed"];
  }

  return client.calls.create(callOptions);
}

async function startStudioExecution(client, params) {
  return client.studio.v2.flows(params.flowSid).executions.create({
    from: params.from,
    to: params.to,
    parameters: {
      handoffId: params.handoffId,
      direction: "outbound",
      customerNumber: params.to,
      twilioNumber: params.from,
    },
  });
}

module.exports = {
  createTwilioClient,
  updateCallWithTwiML,
  startOutboundCall,
  startStudioExecution,
};
