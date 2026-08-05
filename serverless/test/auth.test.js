const { validateBearerToken } = require("../lib/auth");

test("validateBearerToken accepts the configured bearer token", () => {
  expect(() => validateBearerToken({ authorization: "Bearer abc123" }, "abc123")).not.toThrow();
});

test("validateBearerToken rejects missing or wrong tokens", () => {
  expect(() => validateBearerToken({}, "abc123")).toThrow("Unauthorized");
  expect(() => validateBearerToken({ authorization: "Bearer wrong" }, "abc123")).toThrow("Unauthorized");
});
