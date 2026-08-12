function createHandler() {
  return function handler(context, event, callback) {
    callback(null, {
      ok: true,
      callSid: event.CallSid || "",
      status: event.CallStatus || "",
    });
  };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
