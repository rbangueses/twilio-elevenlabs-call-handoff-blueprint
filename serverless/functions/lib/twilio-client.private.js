function createTwilioClient(config) {
  const twilio = require("twilio");
  return twilio(config.twilioAccountSid, config.twilioAuthToken);
}

async function updateCallWithTwiML(client, callSid, twiml) {
  await client.calls(callSid).update({ twiml });
}

module.exports = { createTwilioClient, updateCallWithTwiML };
