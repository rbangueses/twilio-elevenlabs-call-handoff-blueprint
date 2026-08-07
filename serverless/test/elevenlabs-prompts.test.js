const fs = require("fs");
const path = require("path");

function readPrompt(fileName) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "elevenlabs", fileName), "utf8");
}

test("baseline agent prompt keeps the handoff contract without Memory instructions", () => {
  const prompt = readPrompt("agent-prompt.md");

  expect(prompt).toContain("escalate_to_human");
  expect(prompt).toContain("{{parent_call_sid}}");
  expect(prompt).toContain("{{caller_number}}");
  expect(prompt).not.toContain("recall_customer_memory");
});

test("Memory agent prompt adds recall guidance while preserving the handoff contract", () => {
  const prompt = readPrompt("agent-prompt-memory.md");

  expect(prompt).toContain("recall_customer_memory");
  expect(prompt).toContain("at most once");
  expect(prompt).toContain("escalate_to_human");
  expect(prompt).toContain("{{parent_call_sid}}");
  expect(prompt).toContain("{{caller_number}}");
  expect(prompt).toContain("relevant context recalled from Memory");
});
