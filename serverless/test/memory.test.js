const {
  extractMemoryProfileId,
  formatMemoryContext,
  recallCustomerMemory,
} = require("../lib/memory");

const config = {
  twilioAccountSid: "test-account-sid",
  twilioAuthToken: "auth-token",
  memoryStoreId: "mem_store_0123456789abcdefghijklmnop",
  memoryIdType: "phone",
  memoryRecallObservationsLimit: 5,
  memoryRecallSummariesLimit: 2,
};

test("extractMemoryProfileId accepts string and object profile lookup results", () => {
  expect(extractMemoryProfileId({ profiles: ["mem_profile_0123456789abcdefghijklmnop"] }))
    .toBe("mem_profile_0123456789abcdefghijklmnop");
  expect(extractMemoryProfileId({ profiles: [{ id: "mem_profile_abcdef" }] }))
    .toBe("mem_profile_abcdef");
});

test("formatMemoryContext returns concise observation and summary text", () => {
  const text = formatMemoryContext({
    observations: [
      { content: "Caller previously reported password reset email delays." },
    ],
    summaries: [
      { content: "Previous support call ended with a manual reset follow-up." },
    ],
  });

  expect(text).toBe(
    "Relevant customer memory:\n" +
    "- Caller previously reported password reset email delays.\n" +
    "- Previous support call ended with a manual reset follow-up.",
  );
});

test("recallCustomerMemory looks up the caller profile then recalls relevant memory", async () => {
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ profiles: ["mem_profile_0123456789abcdefghijklmnop"] }),
      text: async () => "",
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        observations: [{ content: "Caller prefers SMS follow-up." }],
        summaries: [{ content: "Caller recently asked for account access help." }],
      }),
      text: async () => "",
    });

  const result = await recallCustomerMemory(config, {
    callerNumber: "+15551230000",
    query: "recent account access support context",
  }, fetchImpl);

  expect(result.profileFound).toBe(true);
  expect(result.profileId).toBe("mem_profile_0123456789abcdefghijklmnop");
  expect(result.memoryContext).toContain("Caller prefers SMS follow-up.");
  expect(fetchImpl.mock.calls[0][0])
    .toBe("https://memory.twilio.com/v1/Stores/mem_store_0123456789abcdefghijklmnop/Profiles/Lookup");
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
    idType: "phone",
    value: "+15551230000",
  });
  expect(fetchImpl.mock.calls[1][0])
    .toBe("https://memory.twilio.com/v1/Stores/mem_store_0123456789abcdefghijklmnop/Profiles/mem_profile_0123456789abcdefghijklmnop/Recall");
  expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({
    query: "recent account access support context",
    observationsLimit: 5,
    summariesLimit: 2,
  });
});

test("recallCustomerMemory returns an empty result when no caller profile exists", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ profiles: [] }),
    text: async () => "",
  });

  const result = await recallCustomerMemory(config, {
    callerNumber: "+15551230000",
    query: "recent support context",
  }, fetchImpl);

  expect(result).toEqual({
    ok: true,
    profileFound: false,
    profileId: "",
    memoryContext: "",
    observations: [],
    summaries: [],
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("recallCustomerMemory requires Memory config and caller number", async () => {
  await expect(recallCustomerMemory({ ...config, memoryStoreId: "" }, {
    callerNumber: "+15551230000",
  }, jest.fn())).rejects.toThrow("MEMORY_STORE_ID is required");

  await expect(recallCustomerMemory(config, {}, jest.fn()))
    .rejects.toThrow("callerNumber is required");
});
