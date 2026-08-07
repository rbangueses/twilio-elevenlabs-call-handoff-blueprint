function loadConfig(env) {
  return {
    twilioAccountSid: env.TWILIO_ACCOUNT_SID || env.ACCOUNT_SID || "",
    twilioAuthToken: env.TWILIO_AUTH_TOKEN || env.AUTH_TOKEN || "",
    twilioPhoneNumber: env.TWILIO_PHONE_NUMBER || "",
    elevenlabsApiKey: env.ELEVENLABS_API_KEY || "",
    elevenlabsAgentId: env.ELEVENLABS_AGENT_ID || "",
    handoffToken: env.HANDOFF_TOKEN || "",
    flexWorkflowSid: env.FLEX_WORKFLOW_SID || "",
    taskrouterWaitUrl: env.TASKROUTER_WAIT_URL || "",
    studioFlowWebhookUrl: env.STUDIO_FLOW_WEBHOOK_URL || "",
    memoryStoreId: env.MEMORY_STORE_ID || "",
    memoryIdType: env.MEMORY_ID_TYPE || "phone",
    memoryRecallObservationsLimit: numberValue(env.MEMORY_RECALL_OBSERVATIONS_LIMIT, 5),
    memoryRecallSummariesLimit: numberValue(env.MEMORY_RECALL_SUMMARIES_LIMIT, 2),
    memoryRecallRelevanceThreshold: optionalNumberValue(env.MEMORY_RECALL_RELEVANCE_THRESHOLD),
    memoryRecallLookbackDays: optionalNumberValue(env.MEMORY_RECALL_LOOKBACK_DAYS),
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
  MEMORY_STORE_ID: "memoryStoreId",
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

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

module.exports = { loadConfig, requireEnv, isTaskrouterWorkflowSid };
