const { createHandler } = require("../functions/memory_recall");

function createDependencies(result) {
  return {
    loadConfig: () => ({
      handoffToken: "secret",
      memoryStoreId: "mem_store_0123456789abcdefghijklmnop",
    }),
    validateBearerToken: jest.fn((headers, expectedToken) => {
      if (headers.authorization !== `Bearer ${expectedToken}`) {
        throw new Error("Unauthorized");
      }
    }),
    recallCustomerMemory: jest.fn().mockResolvedValue(result),
  };
}

test("/memory_recall returns recalled memory to the ElevenLabs tool", async () => {
  const memoryResult = {
    ok: true,
    profileFound: true,
    profileId: "mem_profile_0123456789abcdefghijklmnop",
    memoryContext: "Relevant customer memory:\n- Caller prefers SMS follow-up.",
    observations: [{ content: "Caller prefers SMS follow-up." }],
    summaries: [],
  };
  const dependencies = createDependencies(memoryResult);
  const callback = jest.fn();
  const event = {
    callerNumber: "+15551230000",
    query: "recent support context",
    request: { headers: { authorization: "Bearer secret" } },
  };

  await createHandler(dependencies)({}, event, callback);

  expect(dependencies.recallCustomerMemory).toHaveBeenCalledWith(
    expect.objectContaining({ memoryStoreId: "mem_store_0123456789abcdefghijklmnop" }),
    expect.objectContaining({
      callerNumber: "+15551230000",
      query: "recent support context",
    }),
    undefined,
  );
  expect(callback).toHaveBeenCalledWith(null, memoryResult);
});

test("/memory_recall parses JSON request bodies", async () => {
  const dependencies = createDependencies({ ok: true, memoryContext: "" });
  const callback = jest.fn();
  const event = {
    body: JSON.stringify({
      callerNumber: "+15551230000",
      query: "billing preferences",
    }),
    request: { headers: { authorization: "Bearer secret" } },
  };

  await createHandler(dependencies)({}, event, callback);

  expect(dependencies.recallCustomerMemory).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({
      callerNumber: "+15551230000",
      query: "billing preferences",
    }),
    undefined,
  );
});

test("/memory_recall does not call Memory when unauthorized", async () => {
  const dependencies = createDependencies({ ok: true });
  const callback = jest.fn();
  const event = {
    callerNumber: "+15551230000",
    request: { headers: { authorization: "Bearer wrong" } },
  };

  await createHandler(dependencies)({}, event, callback);

  expect(dependencies.recallCustomerMemory).not.toHaveBeenCalled();
  expect(callback).toHaveBeenCalledWith(null, { ok: false, error: "Unauthorized" });
});
