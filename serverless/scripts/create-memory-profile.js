#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const MEMORY_BASE_URL = "https://memory.twilio.com";

function loadEnvFile(filePath = path.join(__dirname, "..", ".env")) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
      .split(/\n/)
      .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
      .filter(Boolean)
      .map((match) => [
        match[1],
        match[2].trim().replace(/^['"]|['"]$/g, ""),
      ]),
  );
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith("--")
      ? argv[++index]
      : "true";
    args[key] = value;
  }
  return args;
}

function buildConfig(env, args) {
  return {
    twilioAccountSid: args.accountSid || env.TWILIO_ACCOUNT_SID || env.ACCOUNT_SID || "",
    twilioAuthToken: args.authToken || env.TWILIO_AUTH_TOKEN || env.AUTH_TOKEN || "",
    memoryStoreId: args.memoryStoreId || env.MEMORY_STORE_ID || "",
    phone: args.phone || env.CUSTOMER_PHONE || "",
    name: args.name || env.CUSTOMER_NAME || "",
    traitGroup: args.traitGroup || env.MEMORY_PROFILE_TRAIT_GROUP || "Contact",
    idType: args.idType || env.MEMORY_ID_TYPE || "phone",
  };
}

function validateConfig(config) {
  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required");
  }
  if (!config.memoryStoreId) {
    throw new Error("MEMORY_STORE_ID is required");
  }
  if (!/^\+\d{7,15}$/.test(config.phone)) {
    throw new Error("Customer phone must be E.164 format, for example +15551234567");
  }
}

async function createMemoryProfile(config, fetchImpl = globalThis.fetch) {
  validateConfig(config);
  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation available");
  }

  const existingProfileId = await lookupProfileId(config, fetchImpl);
  if (existingProfileId) {
    return {
      created: false,
      profileId: existingProfileId,
      phone: config.phone,
    };
  }

  const createResult = await memoryFetch(config, fetchImpl, profileUrl(config), {
    method: "POST",
    body: JSON.stringify({
      traits: {
        [config.traitGroup]: compactObject({
          phone: config.phone,
          name: config.name,
        }),
      },
    }),
  });

  const profileId = await waitForLookup(config, fetchImpl)
    || extractProfileId(createResult);

  return {
    created: true,
    profileId,
    phone: config.phone,
    message: createResult.message || "",
  };
}

async function waitForLookup(config, fetchImpl) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const profileId = await lookupProfileId(config, fetchImpl);
    if (profileId) {
      return profileId;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return "";
}

async function lookupProfileId(config, fetchImpl) {
  const result = await memoryFetch(config, fetchImpl, lookupUrl(config), {
    method: "POST",
    body: JSON.stringify({
      idType: config.idType,
      value: config.phone,
    }),
  });

  return extractProfileId(result);
}

async function memoryFetch(config, fetchImpl, url, options) {
  const response = await fetchImpl(url, {
    ...options,
    headers: {
      Authorization: basicAuthHeader(config),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = typeof response.text === "function" ? await response.text() : "";
    throw new Error(`Memory API request failed with ${response.status}: ${body}`);
  }

  return response.json();
}

function extractProfileId(result) {
  const profiles = Array.isArray(result && result.profiles) ? result.profiles : [];
  const firstProfile = profiles[0];
  if (typeof firstProfile === "string") {
    return firstProfile;
  }
  return (
    firstProfile?.id
    || result?.id
    || result?.profileId
    || result?.profile_id
    || result?.profile?.id
    || ""
  );
}

function profileUrl(config) {
  return `${MEMORY_BASE_URL}/v1/Stores/${encodeURIComponent(config.memoryStoreId)}/Profiles`;
}

function lookupUrl(config) {
  return `${profileUrl(config)}/Lookup`;
}

function basicAuthHeader(config) {
  return `Basic ${Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString("base64")}`;
}

function compactObject(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  );
}

function usage() {
  return [
    "Usage:",
    "  npm run memory:create-profile -- --phone +15551234567",
    "",
    "Optional:",
    "  --memoryStoreId mem_store_xxx",
    "  --name \"Alex Customer\"",
    "  --traitGroup Contact",
    "",
    "Reads TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and MEMORY_STORE_ID from serverless/.env by default.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const env = { ...loadEnvFile(), ...process.env };
  const config = buildConfig(env, args);
  const result = await createMemoryProfile(config);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  buildConfig,
  createMemoryProfile,
  extractProfileId,
  loadEnvFile,
  parseArgs,
};
