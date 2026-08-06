function loadConfig(env) {
  return {
    twilioAccountSid: env.TWILIO_ACCOUNT_SID || env.ACCOUNT_SID || "",
    twilioAuthToken: env.TWILIO_AUTH_TOKEN || env.AUTH_TOKEN || "",
    twilioPhoneNumber: env.TWILIO_PHONE_NUMBER || "",
    elevenlabsApiKey: env.ELEVENLABS_API_KEY || "",
    elevenlabsAgentId: env.ELEVENLABS_AGENT_ID || "",
    handoffToken: env.HANDOFF_TOKEN || "",
    routingMode: env.ROUTING_MODE || "taskrouter",
    flexWorkflowSid: env.FLEX_WORKFLOW_SID || "",
    taskrouterWaitUrl: env.TASKROUTER_WAIT_URL || "",
    studioFlowWebhookUrl: env.STUDIO_FLOW_WEBHOOK_URL || "",
    directTransferMode: env.DIRECT_TRANSFER_MODE || "warm_conference",
    directTransferTo: env.DIRECT_TRANSFER_TO || "",
    directTransferFrom: env.DIRECT_TRANSFER_FROM || env.TWILIO_PHONE_NUMBER || "",
    directHoldUrl: env.DIRECT_HOLD_URL || "http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical",
  };
}

const ENV_TO_CONFIG = {
  TWILIO_ACCOUNT_SID: "twilioAccountSid",
  TWILIO_AUTH_TOKEN: "twilioAuthToken",
  TWILIO_PHONE_NUMBER: "twilioPhoneNumber",
  ELEVENLABS_API_KEY: "elevenlabsApiKey",
  ELEVENLABS_AGENT_ID: "elevenlabsAgentId",
  HANDOFF_TOKEN: "handoffToken",
  FLEX_WORKFLOW_SID: "flexWorkflowSid",
  STUDIO_FLOW_WEBHOOK_URL: "studioFlowWebhookUrl",
  DIRECT_TRANSFER_TO: "directTransferTo",
};

function requireEnv(config, keys) {
  const missing = keys.filter((key) => !config[ENV_TO_CONFIG[key]]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

function isTaskrouterWorkflowSid(value) {
  return /^WW[0-9a-fA-F]{32}$/.test(value || "");
}

module.exports = { loadConfig, requireEnv, isTaskrouterWorkflowSid };
