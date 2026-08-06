# Setup

## Environment

From `serverless`, copy `.env.example` to `.env` and set the values for the selected routing pattern.

| Variable | Purpose |
| --- | --- |
| `TWILIO_SERVERLESS_SERVICE_NAME` | Twilio Serverless service name used by deployment. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Credentials used to update the original parent Call. |
| `TWILIO_PHONE_NUMBER` | Twilio number used for the blueprint. |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_AGENT_ID` | Credentials for ElevenLabs `register-call`. |
| `HANDOFF_TOKEN` | Shared secret required as `Authorization: Bearer <HANDOFF_TOKEN>` for every ElevenLabs tool call. |
| `FLEX_WORKFLOW_SID` / `TASKROUTER_WAIT_URL` | TaskRouter or Flex queue configuration. |
| `STUDIO_FLOW_WEBHOOK_URL` | Published Studio Flow webhook for the `FlowEvent=return` path. |

## Twilio Number and Functions

1. Deploy the Functions from `serverless` with `npm run deploy`.
2. Configure the Twilio number with an HTTPS Voice webhook and a Voice fallback webhook before production use.
3. For the TaskRouter path, point the Voice webhook to `/voice`. For the Studio path, point it to the Studio Flow, whose TwiML Redirect calls `/studio_voice`.
4. Enable Twilio Functions signature-validation access control on inbound Twilio webhook endpoints. If hosting locally or outside Twilio Functions, validate `X-Twilio-Signature` with the Twilio SDK.

## ElevenLabs Agent Setup

1. Create or choose an ElevenLabs Conversational Agent.
2. Set Twilio-compatible audio formats for register-call telephony: mu-law 8000 Hz input and output.
3. Add dynamic variables named `parent_call_sid`, `handoff_id`, `caller_number`, and `called_number`.
4. Add a string environment variable named `handoff_host` for the deployed Twilio Functions host only, such as `example-1234.twil.io`; the tool URL keeps the literal `https://` prefix.
5. Add a secret environment variable named `handoff_authorization` whose production value is the full header value `Bearer <HANDOFF_TOKEN>`.
6. Create the webhook tool from `elevenlabs/escalate-to-human-tool.example.json`; its URL is `/escalate` by default. Use `/studio_escalate` for Pattern A.
7. Attach the webhook tool to the agent through the current ElevenLabs `tool_ids` mechanism.
8. Paste the instructions from `elevenlabs/agent-prompt.md` into the agent prompt.
9. Use the ElevenLabs test console to confirm the dynamic variable `parent_call_sid` resolves and the webhook tool sends it to Twilio in the request-body field `parentCallSid` before testing a real call.

Use the custom webhook tool with `register-call` as the primary architecture. ElevenLabs native `transfer_to_number` is an alternate convenience path only; it does not provide the same Twilio-owned routing control.

## Handoff Data

The tool must send `parentCallSid` for the original inbound parent Call, not an ElevenLabs identifier or child leg. Keep `summary` concise, and do not put PII in function paths, Studio query parameters, conference names, or logs. TaskRouter attribute keys must remain JSON-safe and hyphen-free.
