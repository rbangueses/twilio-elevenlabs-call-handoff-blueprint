# Architecture

## Primary Handoff Path

The primary path is ElevenLabs `register-call` plus the custom `escalate_to_human` webhook tool. It is intentionally not an imported-number transfer: Twilio remains responsible for the inbound number, the original parent Call, and the final human-routing TwiML.

```mermaid
sequenceDiagram
  participant Caller
  participant Twilio
  participant Function as Twilio Function
  participant Eleven as ElevenLabs Agent
  participant Human as Human Routing

  Caller->>Twilio: Calls Twilio number
  Twilio->>Function: POST /voice with CallSid
  Function->>Eleven: register-call with dynamic variables
  Eleven-->>Function: TwiML for AI call
  Function-->>Twilio: TwiML
  Twilio<<->>Eleven: Live phone conversation
  Eleven->>Function: POST /escalate via webhook tool
  Function->>Twilio: Update parent Call with new TwiML
  Twilio->>Human: Enqueue or Studio return
```

`parentCallSid` is the original inbound Twilio Call SID. The escalation handler must update that parent Call, never an ElevenLabs identifier or a child call leg. The ElevenLabs tool sends a concise `summary`, routing `intent`, `reason`, and an opaque `handoffId`; do not place PII in function paths, Studio query parameters, conference names, or logs.

## Routing Patterns

### Pattern A: Studio and Flex

Point the Twilio number at a Studio Flow. A TwiML Redirect widget calls `/studio_voice`, which registers the active call with ElevenLabs. The agent calls `/studio_escalate` when it needs a human. That endpoint updates the original parent Call with a redirect to the published Studio Flow webhook using `FlowEvent=return`, allowing the Flow to continue to Send to Flex.

### Pattern B: TaskRouter and Flex

Point the Twilio number Voice webhook at `/voice` and configure `FLEX_WORKFLOW_SID`. The agent tool calls `/escalate`, which updates the parent Call with `<Enqueue workflowSid="WW...">`. Task attributes use JSON-safe keys such as `reason`, `summary`, `intent`, `parentCallSid`, and `handoffId`; keys do not contain hyphens.

## Alternate Native ElevenLabs Transfer Path

ElevenLabs' native Twilio integration supports the built-in `transfer_to_number` system tool. Use it when you want the fastest transfer to a phone number or SIP URI and do not need Twilio to own the handoff logic.

This blueprint does not use native transfer as the primary path because the register-call approach gives Twilio full control of Studio, Flex, and TaskRouter routing, while ElevenLabs-managed transfer is intentionally limited to the destinations configured inside ElevenLabs.

## Security Boundaries

- Inbound Twilio webhooks deployed on Twilio Functions must enable the platform's signature-validation access control. For local or non-Functions hosting, validate `X-Twilio-Signature` with the Twilio SDK.
- Every ElevenLabs tool call to `/escalate` or `/studio_escalate` must send `Authorization: Bearer <HANDOFF_TOKEN>`.
- Keep the tool summary concise before it enters TaskRouter attributes, Studio query parameters, warm-transfer prompts, or logs.
