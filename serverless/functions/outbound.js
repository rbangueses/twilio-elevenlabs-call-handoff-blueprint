const configModule = typeof Runtime === "undefined"
  ? require("../lib/config")
  : require(Runtime.getFunctions()["lib/config"].path);
const elevenLabsModule = typeof Runtime === "undefined"
  ? require("../lib/elevenlabs")
  : require(Runtime.getFunctions()["lib/elevenlabs"].path);

function unavailableResponse() {
  const response = new Twilio.twiml.VoiceResponse();
  response.say("We are sorry, but the voice assistant is unavailable. Please try again later.");
  return response;
}

function xmlResponse(body) {
  return new Twilio.Response()
    .appendHeader("Content-Type", "application/xml")
    .setBody(body);
}

function createHandler(dependencies = {}) {
  const loadConfig = dependencies.loadConfig || configModule.loadConfig;
  const buildConversationClientData = dependencies.buildConversationClientData || elevenLabsModule.buildConversationClientData;
  const registerTwilioCall = dependencies.registerTwilioCall || elevenLabsModule.registerTwilioCall;
  const createXmlResponse = dependencies.createXmlResponse || xmlResponse;
  const createUnavailableResponse = dependencies.createUnavailableResponse || unavailableResponse;

  return async function handler(context, event, callback) {
    try {
      const config = loadConfig(context);
      const twiml = await registerTwilioCall(config, {
        fromNumber: event.From,
        toNumber: event.To,
        direction: "outbound",
        conversationInitiationClientData: buildConversationClientData(event, { direction: "outbound" }),
      });
      callback(null, createXmlResponse(twiml));
    } catch (error) {
      callback(null, createUnavailableResponse());
    }
  };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
