# Twilio ElevenLabs Call Handoff Blueprint

This repo is a working blueprint for handing an active phone call from an ElevenLabs voice agent back to Twilio, then routing the caller to a human through Flex, TaskRouter, or Programmable Voice.

The core pattern is:

1. Twilio receives the inbound call.
2. A Twilio Function registers the call with ElevenLabs.
3. The Function passes Twilio call metadata into ElevenLabs as dynamic variables.
4. The ElevenLabs agent calls `escalate_to_human` when a human is needed.
5. The protected Twilio Function updates the original parent Call with new TwiML.

Choose a routing pattern:

- Pattern A: Studio owns the journey and receives the call back through `FlowEvent=return`.
- Pattern B: TaskRouter/Flex receives the caller through `<Enqueue workflowSid="WW...">`.
- Pattern C: Programmable Voice dials or conferences a configured human destination.

The primary architecture uses ElevenLabs `register-call`, not an imported-number transfer. This keeps routing control in Twilio through the complete handoff.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `/voice` | Registers an inbound Twilio call with ElevenLabs. |
| `/studio_voice` | Registers a call with ElevenLabs and forces Studio routing metadata. |
| `/outbound` | Registers an outbound Twilio call with ElevenLabs. |
| `/escalate` | Protected ElevenLabs webhook that routes to TaskRouter or direct Voice based on `ROUTING_MODE`. |
| `/studio_escalate` | Protected ElevenLabs webhook that returns the call to Studio. |
| `/direct_transfer` | Protected convenience endpoint that forces the direct Voice routing mode. |
| `/health` | Reports configured routing capabilities without exposing secrets. |

Start with [setup instructions](docs/setup.md), then use [architecture](docs/architecture.md) and [testing guidance](docs/testing.md) to choose and validate a route.
