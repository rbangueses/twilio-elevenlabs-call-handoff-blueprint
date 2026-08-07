const {
  buildConfig,
  createMemoryProfile,
  extractProfileId,
  parseArgs,
} = require("../scripts/create-memory-profile");

const config = {
  twilioAccountSid: "test-account-sid",
  twilioAuthToken: "auth-token",
  memoryStoreId: "mem_store_0123456789abcdefghijklmnop",
  phone: "+15551234567",
  name: "Alex Customer",
  traitGroup: "Contact",
  idType: "phone",
};

test("parseArgs reads phone and Memory Store arguments", () => {
  expect(parseArgs([
    "--phone", "+15551234567",
    "--memoryStoreId", "mem_store_123",
    "--name", "Alex Customer",
  ])).toEqual({
    phone: "+15551234567",
    memoryStoreId: "mem_store_123",
    name: "Alex Customer",
  });
});

test("buildConfig prefers CLI args over env values", () => {
  expect(buildConfig({
    TWILIO_ACCOUNT_SID: "env-account-sid",
    TWILIO_AUTH_TOKEN: "env-token",
    MEMORY_STORE_ID: "mem_store_env",
    CUSTOMER_PHONE: "+15550000000",
  }, {
    phone: "+15551234567",
  })).toMatchObject({
    twilioAccountSid: "env-account-sid",
    twilioAuthToken: "env-token",
    memoryStoreId: "mem_store_env",
    phone: "+15551234567",
    traitGroup: "Contact",
    idType: "phone",
  });
});

test("extractProfileId accepts lookup and create response shapes", () => {
  expect(extractProfileId({ profiles: ["mem_profile_123"] })).toBe("mem_profile_123");
  expect(extractProfileId({ profiles: [{ id: "mem_profile_456" }] })).toBe("mem_profile_456");
  expect(extractProfileId({ id: "mem_profile_789" })).toBe("mem_profile_789");
});

test("createMemoryProfile creates a Contact phone trait when lookup misses", async () => {
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ profiles: null }),
      text: async () => "",
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "mem_profile_created",
        message: "Profile resolved and accepted for processing.",
      }),
      text: async () => "",
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ profiles: ["mem_profile_created"] }),
      text: async () => "",
    });

  const result = await createMemoryProfile(config, fetchImpl);

  expect(result).toEqual({
    created: true,
    profileId: "mem_profile_created",
    phone: "+15551234567",
    message: "Profile resolved and accepted for processing.",
  });
  expect(fetchImpl).toHaveBeenCalledTimes(3);
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
    idType: "phone",
    value: "+15551234567",
  });
  expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({
    traits: {
      Contact: {
        phone: "+15551234567",
        name: "Alex Customer",
      },
    },
  });
});

test("createMemoryProfile skips creation when profile already exists", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ profiles: ["mem_profile_existing"] }),
    text: async () => "",
  });

  await expect(createMemoryProfile(config, fetchImpl)).resolves.toEqual({
    created: false,
    profileId: "mem_profile_existing",
    phone: "+15551234567",
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
