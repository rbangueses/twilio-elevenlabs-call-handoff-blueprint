const authModule = typeof Runtime === "undefined"
  ? require("../lib/auth")
  : require(Runtime.getFunctions()["lib/auth"].path);
const configModule = typeof Runtime === "undefined"
  ? require("../lib/config")
  : require(Runtime.getFunctions()["lib/config"].path);
const twilioClientModule = typeof Runtime === "undefined"
  ? require("../lib/twilio-client")
  : require(Runtime.getFunctions()["lib/twilio-client"].path);

function parsePayload(event) {
  if (typeof event.body === "string" && event.body.trim()) {
    try {
      return { ...event, ...JSON.parse(event.body) };
    } catch {
      return event;
    }
  }

  return event;
}

function createHandler(dependencies = {}) {
  const loadConfig = dependencies.loadConfig || configModule.loadConfig;
  const validateBearerToken = dependencies.validateBearerToken || authModule.validateBearerToken;
  const createTwilioClient = dependencies.createTwilioClient || twilioClientModule.createTwilioClient;
  const startStudioExecution = dependencies.startStudioExecution || twilioClientModule.startStudioExecution;

  return async function handler(context, event, callback) {
    try {
      const config = loadConfig(context);
      validateBearerToken((event.request && event.request.headers) || {}, config.handoffToken);

      const payload = parsePayload(event);
      const from = String(payload.fromNumber || payload.from || config.twilioPhoneNumber || "").trim();
      const to = String(payload.toNumber || payload.to || "").trim();
      const handoffId = String(payload.handoffId || payload.handoff_id || "").trim();

      if (!config.studioOutboundFlowSid) {
        throw new Error("STUDIO_OUTBOUND_FLOW_SID is required");
      }

      if (!from) {
        throw new Error("fromNumber is required or TWILIO_PHONE_NUMBER must be configured");
      }

      if (!to) {
        throw new Error("toNumber is required");
      }

      const execution = await startStudioExecution(createTwilioClient(config), {
        flowSid: config.studioOutboundFlowSid,
        from,
        to,
        handoffId,
      });

      callback(null, {
        ok: true,
        route: "studio_outbound",
        executionSid: execution.sid,
        status: execution.status,
        flowSid: config.studioOutboundFlowSid,
        from,
        to,
        handoffId,
      });
    } catch (error) {
      callback(null, { ok: false, error: error.message });
    }
  };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
