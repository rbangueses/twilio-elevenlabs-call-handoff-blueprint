# WhatsApp Business Calling

WhatsApp Business Calling senders route inbound voice through a TwiML Application. For this blueprint, the TwiML Application is just the entry point that decides whether the call starts in Studio or goes directly to the Twilio Function.

## Routing Options

### Studio-Owned Handoff

Use this when Studio should own the customer journey and Send to Flex.

```text
WhatsApp caller
  -> WhatsApp Business Calling sender
  -> TwiML Application
  -> Studio Flow webhook
  -> TwiML Redirect to /studio_voice
  -> ElevenLabs register-call
  -> ElevenLabs tool calls /studio_escalate
  -> Studio FlowEvent=return
  -> Send to Flex
```

Create a TwiML Application whose Voice URL is the published Studio Flow webhook:

```bash
twilio api:core:applications:create \
  --friendly-name "ElevenLabs Handoff - Studio" \
  --voice-url "https://webhooks.twilio.com/v1/Accounts/$TWILIO_ACCOUNT_SID/Flows/$STUDIO_FLOW_SID" \
  --voice-method POST
```

In ElevenLabs, configure the `escalate_to_human` tool URL for Studio mode:

```text
https://{{system__env_handoff_host}}/studio_escalate
```

### Direct TaskRouter Handoff

Use this when Studio should be bypassed and the Twilio Function should enqueue directly to Flex or another TaskRouter-powered contact center.

```text
WhatsApp caller
  -> WhatsApp Business Calling sender
  -> TwiML Application
  -> /voice
  -> ElevenLabs register-call
  -> ElevenLabs tool calls /escalate
  -> <Enqueue workflowSid="WW...">
  -> Flex or TaskRouter
```

Create a TwiML Application whose Voice URL is the deployed `/voice` Function:

```bash
twilio api:core:applications:create \
  --friendly-name "ElevenLabs Handoff - Direct TaskRouter" \
  --voice-url "https://$TWILIO_FUNCTIONS_HOST/voice" \
  --voice-method POST
```

In ElevenLabs, configure the `escalate_to_human` tool URL for direct TaskRouter mode:

```text
https://{{system__env_handoff_host}}/escalate
```

## Node.js Example

The same setup can be created with the Twilio Node helper library:

```js
const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function createStudioApp() {
  const app = await client.applications.create({
    friendlyName: "ElevenLabs Handoff - Studio",
    voiceUrl: `https://webhooks.twilio.com/v1/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Flows/${process.env.STUDIO_FLOW_SID}`,
    voiceMethod: "POST",
  });

  console.log(app.sid);
}

async function createDirectTaskrouterApp() {
  const app = await client.applications.create({
    friendlyName: "ElevenLabs Handoff - Direct TaskRouter",
    voiceUrl: `https://${process.env.TWILIO_FUNCTIONS_HOST}/voice`,
    voiceMethod: "POST",
  });

  console.log(app.sid);
}

createStudioApp();
createDirectTaskrouterApp();
```

## Assign the TwiML Application

After the TwiML Application exists, assign it to the WhatsApp Business Calling sender in the Twilio Console or through the sender-management API available for your WhatsApp sender type.

Choose the Studio TwiML Application for the Studio-owned route, or the Direct TaskRouter TwiML Application for the direct route. Do not assign both to the same sender at the same time; the sender has one inbound voice route.

## Configuration Notes

Use placeholders in shared documentation and scripts:

- `TWILIO_FUNCTIONS_HOST`: deployed Twilio Functions host, without `https://`.
- `STUDIO_FLOW_SID`: published inbound Studio Flow SID.
- `TWILIO_ACCOUNT_SID`: Twilio Account SID that owns the Flow and Functions.

Do not commit account-specific TwiML Application SIDs, WhatsApp sender SIDs, auth tokens, or environment-specific Flow URLs to the blueprint.
