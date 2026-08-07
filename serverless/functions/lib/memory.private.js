const MEMORY_BASE_URL = "https://memory.twilio.com";

async function recallCustomerMemory(config, input = {}, fetchImpl = globalThis.fetch) {
  if (!config.memoryStoreId) {
    throw new Error("MEMORY_STORE_ID is required");
  }
  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    throw new Error("Twilio credentials are required for Memory Recall");
  }

  const callerNumber = textValue(input.callerNumber || input.customerPhone || input.from);
  if (!callerNumber) {
    throw new Error("callerNumber is required");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation available");
  }

  const profileId = await lookupProfileId(config, callerNumber, fetchImpl);
  if (!profileId) {
    return emptyMemoryResult();
  }

  const recall = await recallProfile(config, profileId, input, fetchImpl);
  return {
    ok: true,
    profileFound: true,
    profileId,
    memoryContext: formatMemoryContext(recall),
    observations: Array.isArray(recall.observations) ? recall.observations : [],
    summaries: Array.isArray(recall.summaries) ? recall.summaries : [],
  };
}

async function lookupProfileId(config, callerNumber, fetchImpl) {
  const response = await memoryFetch(config, fetchImpl, profileLookupUrl(config), {
    method: "POST",
    body: JSON.stringify({
      idType: config.memoryIdType || "phone",
      value: callerNumber,
    }),
  });

  return extractMemoryProfileId(response);
}

async function recallProfile(config, profileId, input, fetchImpl) {
  const body = compactObject({
    query: textValue(input.query),
    observationsLimit: limitValue(input.observationsLimit, config.memoryRecallObservationsLimit, 5),
    summariesLimit: limitValue(input.summariesLimit, config.memoryRecallSummariesLimit, 2),
    relevanceThreshold: optionalNumber(input.relevanceThreshold, config.memoryRecallRelevanceThreshold),
    beginDate: textValue(input.beginDate) || beginDateFromLookbackDays(config.memoryRecallLookbackDays),
    endDate: textValue(input.endDate),
  });

  return memoryFetch(config, fetchImpl, profileRecallUrl(config, profileId), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function memoryFetch(config, fetchImpl, url, options) {
  const response = await fetchImpl(url, {
    ...options,
    headers: {
      Authorization: basicAuthHeader(config),
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = typeof response.text === "function" ? await response.text() : "";
    throw new Error(`Memory API request failed with ${response.status}: ${body}`);
  }

  return response.json();
}

function profileLookupUrl(config) {
  return `${MEMORY_BASE_URL}/v1/Stores/${encodeURIComponent(config.memoryStoreId)}/Profiles/Lookup`;
}

function profileRecallUrl(config, profileId) {
  return `${MEMORY_BASE_URL}/v1/Stores/${encodeURIComponent(config.memoryStoreId)}/Profiles/${encodeURIComponent(profileId)}/Recall`;
}

function extractMemoryProfileId(response) {
  const firstProfile = Array.isArray(response && response.profiles)
    ? response.profiles[0]
    : undefined;

  return (
    response?.id ||
    response?.profileId ||
    response?.profile_id ||
    response?.profile?.id ||
    response?.profile?.profileId ||
    response?.profile?.profile_id ||
    profileIdFromProfile(firstProfile) ||
    ""
  );
}

function profileIdFromProfile(profile) {
  if (typeof profile === "string") {
    return profile;
  }

  return profile?.id || profile?.profileId || profile?.profile_id || profile?.sid || "";
}

function formatMemoryContext(recall) {
  const lines = [
    ...memoryLines(recall.observations),
    ...memoryLines(recall.summaries),
  ];

  if (lines.length === 0) {
    return "";
  }

  return `Relevant customer memory:\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

function memoryLines(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => textValue(item.content || item.text || item.summary))
    .filter(Boolean);
}

function emptyMemoryResult() {
  return {
    ok: true,
    profileFound: false,
    profileId: "",
    memoryContext: "",
    observations: [],
    summaries: [],
  };
}

function basicAuthHeader(config) {
  return `Basic ${Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString("base64")}`;
}

function compactObject(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  );
}

function textValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function limitValue(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return undefined;
}

function optionalNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function beginDateFromLookbackDays(value) {
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0) {
    return undefined;
  }

  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

module.exports = {
  extractMemoryProfileId,
  formatMemoryContext,
  recallCustomerMemory,
};
