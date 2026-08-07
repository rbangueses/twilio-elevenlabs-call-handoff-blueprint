const fs = require("fs");
const path = require("path");

const toolFiles = [
  "escalate-to-human-tool.example.json",
  "recall-customer-memory-tool.example.json",
];

const valueSourceKeys = [
  "description",
  "dynamic_variable",
  "is_system_provided",
  "constant_value",
  "is_omitted",
];

function hasMeaningfulValue(value) {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim() !== "";
  }

  if (typeof value === "boolean") {
    return value;
  }

  return true;
}

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

test.each(toolFiles)("ElevenLabs tool example %s has one value source per body property", (fileName) => {
  const filePath = path.join(__dirname, "..", "..", "elevenlabs", fileName);
  const tool = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const properties = tool.api_schema.request_body_schema.properties;
  const invalidProperties = [];

  for (const [propertyName, propertySchema] of Object.entries(properties)) {
    const configuredValueSources = valueSourceKeys.filter((key) => (
      hasMeaningfulValue(propertySchema[key])
    ));

    if (configuredValueSources.length > 1) {
      invalidProperties.push(`${propertyName}: ${configuredValueSources.join(", ")}`);
    }
  }

  expect(invalidProperties).toEqual([]);
});
