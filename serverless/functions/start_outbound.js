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

function hostedUrl(context, path) {
  if (!context.DOMAIN_NAME) {
    throw new Error(`${path} URL is required when DOMAIN_NAME is unavailable`);
  }

  return `https://${context.DOMAIN_NAME}${path}`;
}

function addQueryParam(url, key, value) {
  if (!value) {
    return url;
  }

  const parsedUrl = new URL(url);
  parsedUrl.searchParams.set(key, value);
  return parsedUrl.toString();
}

function createHandler(dependencies = {}) {
  const loadConfig = dependencies.loadConfig || configModule.loadConfig;
  const validateBearerToken = dependencies.validateBearerToken || authModule.validateBearerToken;
  const createTwilioClient = dependencies.createTwilioClient || twilioClientModule.createTwilioClient;
  const startOutboundCall = dependencies.startOutboundCall || twilioClientModule.startOutboundCall;

  return async function handler(context, event, callback) {
    try {
      const config = loadConfig(context);
      validateBearerToken((event.request && event.request.headers) || {}, config.handoffToken);

      const payload = parsePayload(event);
      const from = String(payload.fromNumber || payload.from || config.twilioPhoneNumber || "").trim();
      const to = String(payload.toNumber || payload.to || "").trim();
      const handoffId = String(payload.handoffId || payload.handoff_id || "").trim();

      if (!from) {
        throw new Error("fromNumber is required or TWILIO_PHONE_NUMBER must be configured");
      }

      if (!to) {
        throw new Error("toNumber is required");
      }

      const outboundWebhookUrl = config.outboundWebhookUrl || hostedUrl(context, "/outbound");
      const statusCallback = config.outboundStatusCallbackUrl || "";
      const url = addQueryParam(outboundWebhookUrl, "HandoffId", handoffId);
      const call = await startOutboundCall(createTwilioClient(config), {
        from,
        to,
        url,
        statusCallback,
      });

      callback(null, {
        ok: true,
        route: "outbound",
        callSid: call.sid,
        status: call.status,
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
exports.addQueryParam = addQueryParam;
