const configModule = typeof Runtime === "undefined"
  ? require("../lib/config")
  : require(Runtime.getFunctions()["lib/config"].path);

const { loadConfig, isTaskrouterWorkflowSid } = configModule;

exports.handler = function handler(context, event, callback) {
  const config = loadConfig(context);
  callback(null, {
    ok: Boolean(config.elevenlabsAgentId && config.handoffToken),
    hasTaskrouter: isTaskrouterWorkflowSid(config.flexWorkflowSid),
    hasStudio: Boolean(config.studioFlowWebhookUrl),
    hasMemory: Boolean(config.memoryStoreId),
  });
};
