# Testing

## Local Tests

Run:

```bash
cd serverless
npm install
npm test
```

## End-to-End Pattern B Test

1. Deploy Twilio Functions.
2. Point the Twilio number Voice webhook to `/voice`.
3. Configure the ElevenLabs agent webhook tool to call `/escalate` with `Authorization: Bearer <HANDOFF_TOKEN>`.
4. Call the Twilio number.
5. Ask for a human.
6. Confirm the original Call is updated with `<Enqueue>`.
7. Confirm Flex or your TaskRouter assignment callback receives task attributes with `reason=ai_escalation`, `summary`, `intent`, `parentCallSid`, and `handoffId`.

## Pattern A: Studio Test

1. Configure the Twilio number to start the Studio Flow and set its TwiML Redirect URL to `/studio_voice`.
2. Set `STUDIO_FLOW_WEBHOOK_URL` to the published Studio Flow webhook.
3. Configure the ElevenLabs tool URL as `/studio_escalate` with `Authorization: Bearer <HANDOFF_TOKEN>`.
4. Call the number and request a human.
5. Confirm the original parent Call redirects to the Studio webhook with `FlowEvent=return` and the Flow continues to Send to Flex.

## Pre-Production Checks

- Confirm `/health` reports the expected configured route without exposing secrets.
- Enable Twilio Functions signature-validation access control for inbound Twilio webhook endpoints. When hosting elsewhere, validate `X-Twilio-Signature` with the Twilio SDK.
- Configure both an HTTPS Voice webhook and a Voice fallback webhook on the Twilio number.
- Confirm every ElevenLabs tool request includes the bearer token and uses a concise, non-PII summary.
