const authModule = typeof Runtime === "undefined"
  ? require("../lib/auth")
  : require(Runtime.getFunctions()["lib/auth"].path);
const configModule = typeof Runtime === "undefined"
  ? require("../lib/config")
  : require(Runtime.getFunctions()["lib/config"].path);
const handoffModule = typeof Runtime === "undefined"
  ? require("../lib/handoff")
  : require(Runtime.getFunctions()["lib/handoff"].path);
const twilioClientModule = typeof Runtime === "undefined"
  ? require("../lib/twilio-client")
  : require(Runtime.getFunctions()["lib/twilio-client"].path);

function createHandler(dependencies = {}) {
  const loadConfig = dependencies.loadConfig || configModule.loadConfig;
  const validateBearerToken = dependencies.validateBearerToken || authModule.validateBearerToken;
  const normalizeHandoffPayload = dependencies.normalizeHandoffPayload || handoffModule.normalizeHandoffPayload;
  const buildTaskrouterTwiML = dependencies.buildTaskrouterTwiML || handoffModule.buildTaskrouterTwiML;
  const createTwilioClient = dependencies.createTwilioClient || twilioClientModule.createTwilioClient;
  const updateCallWithTwiML = dependencies.updateCallWithTwiML || twilioClientModule.updateCallWithTwiML;

  return async function handler(context, event, callback) {
    try {
      const config = loadConfig(context);
      validateBearerToken((context.request && context.request.headers) || {}, config.handoffToken);
      const payload = normalizeHandoffPayload(event);
      const twiml = buildTaskrouterTwiML(config, payload);
      await updateCallWithTwiML(createTwilioClient(config), payload.parentCallSid, twiml);
      callback(null, { ok: true, route: "taskrouter", handoffId: payload.handoffId });
    } catch (error) {
      callback(null, { ok: false, error: error.message });
    }
  };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
