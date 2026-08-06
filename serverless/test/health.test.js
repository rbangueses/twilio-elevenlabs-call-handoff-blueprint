const { handler } = require("../functions/health");

function invokeHealth(context) {
  return new Promise((resolve, reject) => {
    handler(context, {}, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}

test("health does not report TaskRouter ready for a Studio Flow SID", async () => {
  const response = await invokeHealth({
    ELEVENLABS_AGENT_ID: "agent_123",
    HANDOFF_TOKEN: "secret",
    FLEX_WORKFLOW_SID: "FW00000000000000000000000000000000",
  });

  expect(response.hasTaskrouter).toBe(false);
  expect(Object.keys(response).sort()).toEqual(["hasStudio", "hasTaskrouter", "ok"]);
});
