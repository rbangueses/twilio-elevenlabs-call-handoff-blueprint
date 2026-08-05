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
  const buildColdDirectTwiML = dependencies.buildColdDirectTwiML || handoffModule.buildColdDirectTwiML;
  const buildCallerConferenceTwiML = dependencies.buildCallerConferenceTwiML || handoffModule.buildCallerConferenceTwiML;
  const createWarmTransferCall = dependencies.createWarmTransferCall || handoffModule.createWarmTransferCall;
  const createTwilioClient = dependencies.createTwilioClient || twilioClientModule.createTwilioClient;
  const updateCallWithTwiML = dependencies.updateCallWithTwiML || twilioClientModule.updateCallWithTwiML;

  return async function handler(context, event, callback) {
    try {
      const config = loadConfig(context);
      validateBearerToken((event.request && event.request.headers) || {}, config.handoffToken);
      const payload = normalizeHandoffPayload(event);
      const client = createTwilioClient(config);
      let twiml;
      let route = "taskrouter";

      if (config.routingMode === "direct" && config.directTransferMode === "cold_dial") {
        twiml = buildColdDirectTwiML(config, payload);
        route = "direct";
      } else if (config.routingMode === "direct" && config.directTransferMode === "warm_conference") {
        twiml = buildCallerConferenceTwiML(config, payload);
        await createWarmTransferCall(client, config, payload);
        route = "direct";
      } else {
        twiml = buildTaskrouterTwiML(config, payload);
      }

      await updateCallWithTwiML(client, payload.parentCallSid, twiml);
      callback(null, { ok: true, route, handoffId: payload.handoffId });
    } catch (error) {
      callback(null, { ok: false, error: error.message });
    }
  };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
