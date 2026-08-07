const fs = require("fs");
const path = require("path");

const toolFiles = [
  "escalate-to-human-tool.example.json",
  "recall-customer-memory-tool.example.json",
];

test.each(toolFiles)("ElevenLabs tool example %s is importable as a webhook tool", (fileName) => {
  const filePath = path.join(__dirname, "..", "..", "elevenlabs", fileName);
  const tool = JSON.parse(fs.readFileSync(filePath, "utf8"));

  expect(tool.type).toBe("webhook");
  expect(tool.name).toEqual(expect.any(String));
  expect(tool.description).toEqual(expect.any(String));
  expect(tool.api_schema).toEqual(expect.objectContaining({
    url: expect.any(String),
    method: "POST",
    request_body_schema: expect.objectContaining({ type: "object" }),
  }));
});
