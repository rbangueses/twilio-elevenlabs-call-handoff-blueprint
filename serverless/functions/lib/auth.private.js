function validateBearerToken(headers, expectedToken) {
  const value = headers.authorization || headers.Authorization || "";
  if (!expectedToken || value !== `Bearer ${expectedToken}`) {
    throw new Error("Unauthorized");
  }
}

function validateTwilioRequest(authToken, signature, url, params) {
  const twilio = require("twilio");
  if (!twilio.validateRequest(authToken, signature, url, params)) {
    throw new Error("Invalid Twilio signature");
  }
}

module.exports = { validateBearerToken, validateTwilioRequest };
