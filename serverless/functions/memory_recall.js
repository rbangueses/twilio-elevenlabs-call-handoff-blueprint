const authModule = typeof Runtime === "undefined"
  ? require("../lib/auth")
  : require(Runtime.getFunctions()["lib/auth"].path);
const configModule = typeof Runtime === "undefined"
  ? require("../lib/config")
  : require(Runtime.getFunctions()["lib/config"].path);
const memoryModule = typeof Runtime === "undefined"
  ? require("../lib/memory")
  : require(Runtime.getFunctions()["lib/memory"].path);

function createHandler(dependencies = {}) {
  const loadConfig = dependencies.loadConfig || configModule.loadConfig;
  const validateBearerToken = dependencies.validateBearerToken || authModule.validateBearerToken;
  const recallCustomerMemory = dependencies.recallCustomerMemory || memoryModule.recallCustomerMemory;
  const fetchImpl = dependencies.fetchImpl;

  return async function handler(context, event, callback) {
    try {
      const config = loadConfig(context);
      validateBearerToken((event.request && event.request.headers) || {}, config.handoffToken);
      const payload = parsePayload(event);
      const result = await recallCustomerMemory(config, payload, fetchImpl || context.fetch);
      callback(null, result);
    } catch (error) {
      callback(null, { ok: false, error: error.message });
    }
  };
}

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

exports.handler = createHandler();
exports.createHandler = createHandler;
