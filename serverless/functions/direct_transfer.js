const configModule = typeof Runtime === "undefined"
  ? require("../lib/config")
  : require(Runtime.getFunctions()["lib/config"].path);
const escalateModule = typeof Runtime === "undefined"
  ? require("./escalate")
  : require(Runtime.getFunctions()["escalate"].path);

function createHandler(dependencies = {}) {
  const loadConfig = dependencies.loadConfig || configModule.loadConfig;

  return escalateModule.createHandler({
    ...dependencies,
    loadConfig: (context) => ({ ...loadConfig(context), routingMode: "direct" }),
  });
}

exports.handler = createHandler();
exports.createHandler = createHandler;
