# Twilio ElevenLabs Call Handoff Blueprint

Conversational AI agents need a clean way to escalate to a human when they cannot resolve an interaction on their own.

For a high-level introduction, see [overview.html](overview.html).

This repo is a working blueprint for handing an active phone call from an ElevenLabs Conversational AI agent back to Twilio, then routing that caller to a human with context. The tested destinations are Twilio Studio, TaskRouter, and Flex. The core pattern is broader: pass the original Twilio parent `CallSid` into ElevenLabs as a dynamic variable, let the ElevenLabs agent decide when to escalate, then update that original Twilio Call resource with the next TwiML instruction.

Flex is the reference human-agent destination in this repo. Pattern A uses Studio to resume the journey and then Send to Flex. Pattern B sends the caller directly to TaskRouter/Flex with `<Enqueue>`. The same parent-call update pattern can be adapted to another TaskRouter-powered contact center.

This blueprint intentionally uses ElevenLabs `register-call` and a custom ElevenLabs webhook tool. It does not rely on ElevenLabs native `transfer_to_number` as the primary path, because native transfer is best for simple blind transfer to a configured phone number or SIP URI. The goal here is Twilio-owned routing with handoff context: summary, intent, reason, original caller, original called number, parent call SID, and handoff ID.

The repo has been exercised end to end with the included inbound handoff paths, the outbound TaskRouter happy path, and a Studio-owned outbound path that returns to Studio before using Enqueue Call:

- **Studio path:** Twilio number starts a Studio Flow, Studio calls `/studio_voice`, ElevenLabs calls `/studio_escalate`, and the call returns to the same Studio execution before Send to Flex.
- **TaskRouter path:** Twilio number calls `/voice`, ElevenLabs calls `/escalate`, and the original parent call is updated with `<Enqueue>` for Flex or another TaskRouter-powered contact center.
- **Outbound TaskRouter path:** Your app calls `/start_outbound`, Twilio places an outbound call, `/outbound` connects the answered call to ElevenLabs, and `/escalate` enqueues the call to Flex with context.
- **Outbound Studio path:** Your app calls `/start_studio_outbound`, Studio places the outbound call, `/outbound` connects the answered call to ElevenLabs, and `/studio_escalate` returns the call to Studio before Enqueue Call routes the voice task to TaskRouter/Flex. As of August 12, 2026, using Send to Flex for this final step is not supported in REST API-triggered flows, so Enqueue Call is the working interim Studio route.

> **Proof of concept.** This blueprint is intended as a working reference implementation, not a production drop-in. Before using it in production, adapt the routing, authentication, prompts, observability, error handling, security controls, data-retention behavior, and compliance posture to your use case.

## Index

- [1. Prerequisites](#1-prerequisites)
- [2. Choose the Escalation Pattern](#2-choose-the-escalation-pattern)
  - [2.1 Function Paths](#21-function-paths)
  - [2.2 WhatsApp Business Calling Entry Point](#22-whatsapp-business-calling-entry-point)
- [3. Shared Setup](#3-shared-setup)
  - [3.1 Deploy the Twilio Functions](#31-deploy-the-twilio-functions)
  - [3.2 Configure the ElevenLabs Agent](#32-configure-the-elevenlabs-agent)
  - [3.3 Configure the ElevenLabs Tool](#33-configure-the-elevenlabs-tool)
- [4. Pattern A Setup: Using Studio](#4-pattern-a-setup-using-studio)
- [5. Pattern B Setup: Using TaskRouter](#5-pattern-b-setup-using-taskrouter)
- [6. Outbound Calls](#6-outbound-calls)
- [7. Optional Conversation Memory](#7-optional-conversation-memory)
- [8. Native ElevenLabs Transfer](#8-native-elevenlabs-transfer)
- [9. How the Patterns Target the Right Call](#9-how-the-patterns-target-the-right-call)
- [10. Test End to End](#10-test-end-to-end)
- [11. Display Task Attributes in Flex](#11-display-task-attributes-in-flex)
- [12. Local Checks](#12-local-checks)

## 1. Prerequisites

You need:

- A Twilio account.
- A Twilio phone number for inbound calls.
- An ElevenLabs account with Conversational AI access.
- An ElevenLabs Conversational AI agent.
- An ElevenLabs API key that can read/update Conversational AI agents and tools.
- The Twilio CLI if you want to deploy the Functions from this repo.

For the tested TaskRouter/Flex paths, you also need:

- Flex enabled in the Twilio account, or another TaskRouter-powered contact center.
- The TaskRouter Workflow SID that should receive escalated voice tasks. This must start with `WW`; do not use a Studio Flow SID (`FW...`) or a TaskRouter Workspace SID (`WS...`).
- For Pattern A, a Studio Flow with a TwiML Redirect widget and a Send to Flex widget.
- For Studio-owned outbound, a REST-triggered Studio Flow with Make Outgoing Call, TwiML Redirect, and Enqueue Call widgets.

Install and authenticate the Twilio CLI:

```bash
twilio login
twilio plugins:install @twilio-labs/plugin-serverless
```

Choose this secret yourself:

- `HANDOFF_TOKEN`: shared by the ElevenLabs webhook tool and the protected Twilio Functions it calls.

For example:

```bash
openssl rand -base64 32
```

## 2. Choose the Escalation Pattern

Use **Pattern A** when the Twilio number already starts in Studio, or when you want Studio to own the IVR, branching, reporting, and final Send to Flex widget.

Use **Pattern B** when you want the smallest direct TaskRouter handoff: a Twilio Function connects the caller to ElevenLabs, and the ElevenLabs tool updates the parent call with `<Enqueue>`.

Use **outbound TaskRouter** when your app should place the customer call and then hand off directly to TaskRouter/Flex with `/escalate`.

Use **outbound Studio** when your app should start a Studio execution, let Studio place the outbound call, and then return to Studio before Enqueue Call routes the task. This is the working Studio-owned outbound path until Send to Flex supports REST API-triggered flows.

Use **ElevenLabs native transfer** when the desired outcome is simply "send this caller to a phone number or SIP URI" and you do not need Twilio to receive the summary or control Studio/Flex/TaskRouter routing.

> **Context payload extension point.** This reference implementation passes concise handoff context inline as Studio, TaskRouter, or Flex task attributes. In production, keep those attributes short. If the handoff payload grows, or if the destination is a generic TwiML route without TaskRouter attributes, store the full context in an external datastore keyed by `handoffId`, `parentCallSid`, or another correlation ID. Then pass only the identifier, such as `contextRef`, so Flex, a custom agent desktop, CRM, or another downstream system can retrieve the full context when needed.

### 2.1 Function Paths

The repo includes these tested Function paths:

- [serverless/functions/studio_voice.js](serverless/functions/studio_voice.js): Pattern A entrypoint called by the Studio TwiML Redirect widget.
- [serverless/functions/studio_escalate.js](serverless/functions/studio_escalate.js): Pattern A handoff endpoint called by the ElevenLabs webhook tool.
- [serverless/functions/voice.js](serverless/functions/voice.js): Pattern B entrypoint called directly by the Twilio number webhook.
- [serverless/functions/escalate.js](serverless/functions/escalate.js): Pattern B handoff endpoint called by the ElevenLabs webhook tool.
- [serverless/functions/start_outbound.js](serverless/functions/start_outbound.js): outbound starter that creates the Twilio call.
- [serverless/functions/start_studio_outbound.js](serverless/functions/start_studio_outbound.js): outbound starter that creates a Studio execution and lets Studio place the call.
- [serverless/functions/outbound.js](serverless/functions/outbound.js): outbound voice webhook that registers the answered call with ElevenLabs.
- [serverless/functions/outbound_status.js](serverless/functions/outbound_status.js): optional Twilio call-progress callback endpoint.

A single Twilio phone number can be pointed at one incoming voice target at a time. To test Pattern A, route the number to the Studio Flow. To test Pattern B, route the same number directly to `/voice`.

The ElevenLabs webhook tool also has one webhook URL at a time. To preserve the same explicit pattern as the LiveKit blueprint, configure separate tools or separate agents for Pattern A and Pattern B:

- Pattern A tool URL: `https://{{system__env_handoff_host}}/studio_escalate`
- Pattern B and outbound TaskRouter tool URL: `https://{{system__env_handoff_host}}/escalate`
- Outbound Studio tool URL: `https://{{system__env_handoff_host}}/studio_escalate`

If you point a Studio-started call at `/studio_voice` but the ElevenLabs tool still calls `/escalate`, the call can still reach Flex. However, Studio will not resume through the TwiML Redirect `return` transition; `/escalate` bypasses Studio and enqueues directly.

### 2.2 WhatsApp Business Calling Entry Point

The same inbound handoff patterns can also be used with Twilio WhatsApp Business Calling. In that case, the WhatsApp sender does not point directly at a phone-number webhook. Instead, configure the WhatsApp sender's Voice Endpoint Configuration to use a TwiML Voice Application. That TwiML App is the entry point into this blueprint.

For the direct TaskRouter/Flex path, set the TwiML App Voice Request URL to the deployed `/voice` Function and use `POST`:

```text
https://your-functions-service-1234.twil.io/voice
```

Configure the ElevenLabs `escalate_to_human` tool URL for that agent as:

```text
https://{{system__env_handoff_host}}/escalate
```

For the Studio-owned path, set the TwiML App Voice Request URL to the published Studio Flow webhook and use `POST`:

```text
https://webhooks.twilio.com/v1/Accounts/ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/Flows/FWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

That Studio Flow should then use the TwiML Redirect widget to call `/studio_voice`, and the ElevenLabs `escalate_to_human` tool should call:

```text
https://{{system__env_handoff_host}}/studio_escalate
```

After creating the TwiML App, assign it to the WhatsApp Business Calling sender. The sender has one inbound voice route at a time, so choose either the direct `/voice` route or the Studio Flow route for a given test. See [docs/whatsapp-business-calling.md](docs/whatsapp-business-calling.md) for a fuller walkthrough.

## 3. Shared Setup

### 3.1 Deploy the Twilio Functions

Create the deployment env file:

```bash
cp serverless/.env.example serverless/.env
```

Fill in `serverless/.env`:

```text
TWILIO_SERVERLESS_SERVICE_NAME=elevenlabs-handoff-blueprint
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=replace_with_twilio_auth_token
TWILIO_PHONE_NUMBER=+15551234567

ELEVENLABS_API_KEY=replace_with_xi_api_key
ELEVENLABS_AGENT_ID=agent_xxxxxxxxxxxxxxxxxxxxxxxx

HANDOFF_TOKEN=replace_with_long_random_token

FLEX_WORKFLOW_SID=WWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TASKROUTER_WAIT_URL=

STUDIO_FLOW_WEBHOOK_URL=https://webhooks.twilio.com/v1/Accounts/ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/Flows/FWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
STUDIO_OUTBOUND_FLOW_SID=FWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
STUDIO_OUTBOUND_FLOW_WEBHOOK_URL=https://webhooks.twilio.com/v1/Accounts/ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/Flows/FWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional direct outbound-call starter. Leave blank to let Twilio Functions derive
# https://<service-domain>/outbound for deployed Functions.
OUTBOUND_WEBHOOK_URL=
OUTBOUND_STATUS_CALLBACK_URL=

# Optional Conversation Memory.
MEMORY_STORE_ID=
MEMORY_ID_TYPE=phone
MEMORY_PROFILE_TRAIT_GROUP=Contact
MEMORY_RECALL_OBSERVATIONS_LIMIT=5
MEMORY_RECALL_SUMMARIES_LIMIT=2
MEMORY_RECALL_RELEVANCE_THRESHOLD=
MEMORY_RECALL_LOOKBACK_DAYS=
```

`FLEX_WORKFLOW_SID` is required for Pattern B, direct outbound TaskRouter handoff, and the outbound Studio Enqueue Call widget. `STUDIO_FLOW_WEBHOOK_URL` is required for inbound Pattern A. `STUDIO_OUTBOUND_FLOW_SID` and `STUDIO_OUTBOUND_FLOW_WEBHOOK_URL` are required only for Studio-owned outbound. If you create a Studio Flow after the first Function deployment, add the Flow webhook URL to `serverless/.env` and deploy again.

Deploy:

```bash
cd serverless
set -a
source .env
set +a
npm run deploy
```

The deployment produces these public Function URLs:

```text
https://your-functions-service-1234.twil.io/studio_voice
https://your-functions-service-1234.twil.io/studio_escalate
https://your-functions-service-1234.twil.io/voice
https://your-functions-service-1234.twil.io/escalate
https://your-functions-service-1234.twil.io/start_outbound
https://your-functions-service-1234.twil.io/start_studio_outbound
https://your-functions-service-1234.twil.io/outbound
https://your-functions-service-1234.twil.io/outbound_status
https://your-functions-service-1234.twil.io/memory_recall
https://your-functions-service-1234.twil.io/health
```

Check the deployment:

```bash
curl https://your-functions-service-1234.twil.io/health
```

Expected shape:

```json
{
  "ok": true,
  "hasTaskrouter": true,
  "hasStudio": true,
  "hasMemory": false
}
```

The `hasTaskrouter` value only reports `true` when `FLEX_WORKFLOW_SID` looks like a `WW...` TaskRouter Workflow SID.
The `hasMemory` value reports whether `MEMORY_STORE_ID` is configured.

### 3.2 Configure the ElevenLabs Agent

Create or choose an ElevenLabs Conversational AI agent.

Set telephony-friendly audio formats:

- User input audio format: `ulaw_8000`
- Agent output audio format: `ulaw_8000`

Add these dynamic variable placeholders to the agent:

```text
parent_call_sid
handoff_id
caller_number
called_number
call_direction
customer_number
twilio_number
```

The `/voice`, `/studio_voice`, and `/outbound` Functions set those values through ElevenLabs `register-call`:

```json
{
  "type": "conversation_initiation_client_data",
  "dynamic_variables": {
    "parent_call_sid": "CA...",
    "handoff_id": "CA...",
    "call_direction": "inbound",
    "caller_number": "+15551230000",
    "called_number": "+15551239999",
    "customer_number": "+15551230000",
    "twilio_number": "+15551239999"
  }
}
```

`parent_call_sid` is the active Twilio Call SID that the escalation Function updates. For inbound calls, `customer_number` equals the caller. For outbound calls, `customer_number` equals the called party and `twilio_number` equals the Twilio number that placed the call. `handoff_id` is a correlation field for Flex attributes, logs, and analytics. The sample defaults it to the parent call SID if no separate handoff ID is provided.

Paste [elevenlabs/agent-prompt.md](elevenlabs/agent-prompt.md) into the agent prompt. If you enable the optional Conversation Memory overlay, use [elevenlabs/agent-prompt-memory.md](elevenlabs/agent-prompt-memory.md) instead. If you want to test both Pattern A and Pattern B with the same ElevenLabs agent, attach both tools and make their names/descriptions explicit enough for the model to choose the right one in that test. For the simplest reproduction, use one agent/tool configuration per pattern.

### 3.3 Configure the ElevenLabs Tool

Create a string environment variable in ElevenLabs:

```text
label: handoff_host
production value: your-functions-service-1234.twil.io
```

Create a secret environment variable in ElevenLabs:

```text
label: handoff_authorization
production value: Bearer <HANDOFF_TOKEN>
```

Create the webhook tool from [elevenlabs/escalate-to-human-tool.example.json](elevenlabs/escalate-to-human-tool.example.json). This file uses the ElevenLabs Tools API `tool_config` shape. To create the tool through the API, wrap it in a `tool_config` object:

```bash
jq '{ tool_config: . }' ../elevenlabs/escalate-to-human-tool.example.json > /tmp/escalate-to-human-tool.request.json
curl -X POST https://api.elevenlabs.io/v1/convai/tools \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "content-type: application/json" \
  --data @/tmp/escalate-to-human-tool.request.json
```

If you create the tool in the ElevenLabs UI, use the JSON file as a reference and fill the form fields manually. The UI's "edit JSON" panel can use an internal form-state shape where headers, path params, query params, and body properties are arrays; pasting the API JSON there can produce validation errors such as "expected array" for `request_headers` or `request_body_schema.properties`.

In the Tools API shape, body properties that use `dynamic_variable` intentionally omit `description`. ElevenLabs accepts only one of `description`, `dynamic_variable`, `is_system_provided`, `constant_value`, or `is_omitted` per string body property.

The example includes the timing settings used for voice handoff:

```json
{
  "pre_tool_speech": "force",
  "execution_mode": "post_tool_speech",
  "interruption_mode": "disable_during_tool"
}
```

Those settings let the agent finish the transfer sentence before the webhook updates the Twilio call.

If you edit the tool in the ElevenLabs UI, re-check these timing fields before testing. The URL can be changed without changing the body schema, but the UI may reset timing fields to immediate execution. Immediate execution can cut off the agent's transfer sentence because Twilio updates the live call as soon as the tool runs.

Also keep the body-parameters description populated. The included tool example sets it to:

```text
Payload sent to Twilio when the caller needs a human. Dynamic variables identify the original Twilio parent call, and LLM-generated fields provide concise escalation context for the receiving agent.
```

For **Pattern B**, use the default URL:

```text
https://{{system__env_handoff_host}}/escalate
```

For **Pattern A**, create a second tool or duplicate the tool configuration and change the URL to:

```text
https://{{system__env_handoff_host}}/studio_escalate
```

Attach the tool to the agent through the current ElevenLabs `tool_ids` mechanism.

Use the ElevenLabs test console to confirm the tool request body contains:

```json
{
  "parentCallSid": "CA...",
  "handoffId": "CA...",
  "intent": "account_access",
  "reason": "explicit_request",
  "summary": "Concise handoff summary",
  "direction": "inbound",
  "customerNumber": "+15551230000",
  "twilioNumber": "+15551239999",
  "from": "+15551230000",
  "to": "+15551239999"
}
```

## 4. Pattern A Setup: Using Studio

Pattern A keeps Studio in control of the inbound voice journey. Studio sends the caller to ElevenLabs only for the AI-agent portion, then resumes the same Studio execution when the ElevenLabs agent escalates.

The call flow is:

1. Caller dials your Twilio number.
2. Twilio starts the Studio Flow.
3. Studio enters a TwiML Redirect widget named `redirect_to_elevenlabs`.
4. The TwiML Redirect widget calls `/studio_voice`, which registers the active call with ElevenLabs.
5. ElevenLabs returns TwiML with `<Connect><Stream>` to connect the live call to the ElevenLabs agent.
6. The ElevenLabs agent calls the Studio handoff tool when it needs a human.
7. The tool posts to `/studio_escalate`.
8. `/studio_escalate` updates the original Twilio Call resource with `<Redirect>` back to the Studio Flow webhook using `FlowEvent=return`.
9. Studio resumes on the TwiML Redirect widget's `return` transition.
10. Studio uses Send to Flex to create the Flex voice task.

### 4.1 Create or Import the Studio Flow

This repo includes a share-safe Studio Flow template at [studio/elevenlabs-flex-handoff-flow.example.json](studio/elevenlabs-flex-handoff-flow.example.json).

The sample flow has this shape:

```text
Trigger: Incoming Call
  -> TwiML Redirect: redirect_to_elevenlabs
      return -> Send to Flex: send_to_flex_1
```

You can import the sample JSON if you manage Studio flows as JSON, or create the same widgets manually in Studio Console.

Set the TwiML Redirect widget URL to:

```text
https://your-functions-service-1234.twil.io/studio_voice
```

Set the method to `POST`.

Configure the Send to Flex widget by selecting:

- **Workflow:** the Flex TaskRouter Workflow that should receive escalated voice tasks.
- **Channel:** your Flex voice Channel.

The Send to Flex widget uses task attributes returned from the TwiML Redirect widget:

```json
{
  "type": "inbound",
  "name": "{{trigger.call.From}}",
  "from": "{{trigger.call.From}}",
  "customerAddress": "{{trigger.call.From}}",
  "customerName": "{{trigger.call.From}}",
  "channelType": "voice",
  "reason": "ai_escalation",
  "direction": "{{widgets.redirect_to_elevenlabs.direction}}",
  "intent": "{{widgets.redirect_to_elevenlabs.intent}}",
  "summary": "{{widgets.redirect_to_elevenlabs.summary}}",
  "description": "{{widgets.redirect_to_elevenlabs.description}}",
  "parentCallSid": "{{widgets.redirect_to_elevenlabs.parentCallSid}}",
  "handoffId": "{{widgets.redirect_to_elevenlabs.handoffId}}",
  "customerNumber": "{{widgets.redirect_to_elevenlabs.customerNumber}}",
  "twilioNumber": "{{widgets.redirect_to_elevenlabs.twilioNumber}}"
}
```

Keep `summary` and `description` short. They become TaskRouter attributes.

Save and publish the Studio Flow. Copy the Flow webhook URL into `STUDIO_FLOW_WEBHOOK_URL` in `serverless/.env`, then redeploy the Functions so `/studio_escalate` can return the active call to that Flow.

`STUDIO_FLOW_WEBHOOK_URL` must be the published Studio Flow webhook URL from Studio, not the `/studio_voice` Function URL and not the placeholder value from `.env.example`. It should look like:

```text
https://webhooks.twilio.com/v1/Accounts/ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/Flows/FWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

If this value still contains placeholder `ACxxxxxxxx...` or `FWxxxxxxxx...`, Twilio will redirect the live call to a missing Flow and the caller may hear "We are sorry, an application error has occurred."

### 4.2 Configure the Twilio Number

For Pattern A, configure the phone number's incoming voice behavior to the Studio Flow, not directly to a Twilio Function:

```text
A call comes in: Studio Flow
Flow: your ElevenLabs handoff Studio Flow
```

### 4.3 Configure the ElevenLabs Studio Tool

For Pattern A, the ElevenLabs handoff tool must call:

```text
https://{{system__env_handoff_host}}/studio_escalate
```

Do not use `/escalate` if you want Studio to resume. `/escalate` sends the call directly to TaskRouter/Flex and bypasses the Studio return transition.

## 5. Pattern B Setup: Using TaskRouter

Pattern B sends the caller directly to ElevenLabs from the Twilio number webhook and uses `/escalate` to update the parent call with `<Enqueue>`.

The call flow is:

1. Caller dials your Twilio number.
2. Twilio invokes the `/voice` Function.
3. `/voice` registers the call with ElevenLabs and passes the original inbound `CallSid` as dynamic handoff context.
4. ElevenLabs returns TwiML with `<Connect><Stream>`.
5. The ElevenLabs agent calls the TaskRouter handoff tool when it needs a human.
6. The tool posts to `/escalate`.
7. `/escalate` updates the original Twilio Call resource with `<Enqueue workflowSid="WW...">`.
8. TaskRouter creates the voice task. In this repo, Flex receives that task through its TaskRouter workflow.

### 5.1 Configure the Twilio Number Webhook

For Pattern B, configure the phone number's incoming voice webhook to the `/voice` Function URL:

```text
POST https://your-functions-service-1234.twil.io/voice
```

The `/voice` Function returns TwiML like:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://api.elevenlabs.io/v1/convai/conversation">
      <Parameter name="conversation_id" value="conv_..." />
    </Stream>
  </Connect>
</Response>
```

### 5.2 Configure the ElevenLabs TaskRouter Tool

For Pattern B, the ElevenLabs handoff tool must call:

```text
https://{{system__env_handoff_host}}/escalate
```

Configure `FLEX_WORKFLOW_SID=WW...` in `serverless/.env`, then redeploy.

## 6. Outbound Calls

The outbound starter lets your app initiate a customer call and still use the same ElevenLabs handoff tool contract. The direct TaskRouter route mirrors Pattern B. The Studio-owned route mirrors Pattern A: Studio owns the outbound execution, then resumes after ElevenLabs escalation.

### 6.1 Direct TaskRouter/Flex Outbound

For direct TaskRouter/Flex outbound, your app calls `/start_outbound`, Twilio creates an outbound Programmable Voice call to the customer, and Twilio invokes `/outbound` when that call is answered. `/outbound` registers the live call with ElevenLabs using `direction=outbound`.

The direct TaskRouter call flow is:

1. Your app posts to `/start_outbound` with the customer phone number.
2. `/start_outbound` creates a Twilio outbound call from `TWILIO_PHONE_NUMBER`.
3. Twilio invokes `/outbound` as the call's Voice URL.
4. `/outbound` registers the call with ElevenLabs and passes `call_direction=outbound`, `customer_number=<called party>`, and `twilio_number=<Twilio number>`.
5. ElevenLabs returns TwiML with `<Connect><Stream>`.
6. The ElevenLabs agent calls the TaskRouter handoff tool when it needs a human.
7. The tool posts to `/escalate`.
8. `/escalate` updates the original outbound Twilio Call resource with `<Enqueue workflowSid="WW...">`.
9. TaskRouter creates the voice task, and Flex receives the task with handoff context.

### 6.2 Direct TaskRouter Tested Happy Path

The current outbound happy path has been tested with direct TaskRouter/Flex enqueue:

1. `/start_outbound` created the outbound Twilio call.
2. The customer answered the call.
3. Twilio invoked `/outbound`.
4. `/outbound` registered the call with ElevenLabs and set `call_direction=outbound`.
5. The ElevenLabs agent escalated through `escalate_to_human`.
6. `/escalate` updated the active outbound Call with `<Enqueue>`.
7. Flex received the voice task with `description`, `direction`, and `escalationReason` task attributes.

Expected outbound Flex attributes include:

```json
{
  "type": "outbound",
  "reason": "ai_escalation",
  "direction": "outbound",
  "channelType": "voice",
  "intent": "account_access",
  "escalationReason": "automation_limit",
  "summary": "The customer needs help from a human agent.",
  "description": "The customer needs help from a human agent.",
  "parentCallSid": "CA...",
  "handoffId": "outbound-demo-1",
  "from": "+15551239999",
  "to": "+447397321173",
  "customerNumber": "+447397321173",
  "twilioNumber": "+15551239999"
}
```

### 6.3 Configure Outbound URLs

Leave `OUTBOUND_WEBHOOK_URL` blank in deployed Twilio Functions unless you need to override it. The Function will derive:

```text
https://your-functions-service-1234.twil.io/outbound
```

If you want Twilio call-progress events, set:

```text
OUTBOUND_STATUS_CALLBACK_URL=https://your-functions-service-1234.twil.io/outbound_status
```

### 6.4 Start a Direct TaskRouter Test Call

Then start a test call:

```bash
curl -X POST "https://your-functions-service-1234.twil.io/start_outbound" \
  -H "authorization: Bearer $HANDOFF_TOKEN" \
  -H "content-type: application/json" \
  --data '{
    "toNumber": "+15551230000",
    "handoffId": "outbound-demo-1"
  }'
```

The response shape is:

```json
{
  "ok": true,
  "route": "outbound",
  "callSid": "CA...",
  "status": "queued",
  "from": "+15551239999",
  "to": "+15551230000",
  "handoffId": "outbound-demo-1"
}
```

Outbound calling can incur charges and may trigger compliance requirements. For production, add consent checks, local quiet-hour enforcement, suppression lists, branded calling or trust controls where appropriate, retry policy, rate limits, and observability before using this starter path.

### 6.5 Studio-Owned Outbound

> **Current platform limitation as of August 12, 2026.** The ideal Studio-owned outbound shape would end with Send to Flex, matching the inbound Studio pattern. Today, Send to Flex fails with `failedToEnqueue` in this flow because Studio currently supports that widget only for incoming call and incoming chat triggers, not REST API-triggered flows. Product is aware of this limitation and may support the cleaner Send to Flex path in the future. Until then, the working Studio-owned outbound route is to return to Studio and use Enqueue Call with the Flex TaskRouter Workflow.

For Studio-owned outbound, create and publish a REST-triggered Studio Flow with this shape:

```text
Trigger: REST API
  -> Make Outgoing Call: call_customer
      answered -> TwiML Redirect: redirect_to_elevenlabs
        return -> Enqueue Call: enqueue_call_1
```

The TwiML Redirect widget URL should point to:

```text
https://your-functions-service-1234.twil.io/outbound?HandoffId={{flow.data.handoffId}}
```

The outbound Studio call flow is:

1. Your app posts to `/start_studio_outbound` with the customer phone number.
2. `/start_studio_outbound` creates a Studio Execution using `STUDIO_OUTBOUND_FLOW_SID`.
3. Studio's Make Outgoing Call widget places the call from `TWILIO_PHONE_NUMBER` to the customer.
4. When the customer answers, Studio's TwiML Redirect widget calls `/outbound`.
5. `/outbound` registers the call with ElevenLabs and passes `call_direction=outbound`, `customer_number=<called party>`, and `twilio_number=<Twilio number>`.
6. The ElevenLabs agent calls the Studio handoff tool when it needs a human.
7. The tool posts to `/studio_escalate`.
8. `/studio_escalate` detects `direction=outbound` and redirects the live call back to `STUDIO_OUTBOUND_FLOW_WEBHOOK_URL` with `FlowEvent=return`.
9. Studio resumes on the TwiML Redirect widget's `return` transition.
10. Studio uses Enqueue Call with the Flex TaskRouter Workflow to create the Flex voice task.

This is not quite as ergonomic as Send to Flex because it exposes the lower-level TaskRouter enqueue configuration in Studio. Keep the widget named clearly, such as `enqueue_call_1`, and configure it with the same Flex Workflow SID used by the direct TaskRouter path. When Studio supports Send to Flex for REST API-triggered outbound flows, this final widget should be replaceable with Send to Flex to align the outbound Studio path with the inbound Studio path.

Configure the Enqueue Call widget with:

- **Workflow:** the Flex TaskRouter Workflow that should receive the outbound voice task.
- **Task attributes:** the same handoff context used by the direct TaskRouter path, including `summary`, `description`, `intent`, `direction`, `parentCallSid`, `handoffId`, `customerNumber`, and `twilioNumber`.
- **Priority/timeout:** choose values that match your contact-center routing policy.

Set these values in `serverless/.env`, then redeploy:

```text
STUDIO_OUTBOUND_FLOW_SID=FWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
STUDIO_OUTBOUND_FLOW_WEBHOOK_URL=https://webhooks.twilio.com/v1/Accounts/ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/Flows/FWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

`STUDIO_OUTBOUND_FLOW_SID` is used by `/start_studio_outbound` to create the Studio Execution. `STUDIO_OUTBOUND_FLOW_WEBHOOK_URL` is used by `/studio_escalate` to return the live outbound call to the same published Flow execution.

Reference starter call for this Studio-owned outbound path:

```bash
curl -X POST "https://your-functions-service-1234.twil.io/start_studio_outbound" \
  -H "authorization: Bearer $HANDOFF_TOKEN" \
  -H "content-type: application/json" \
  --data '{
    "toNumber": "+15551230000",
    "handoffId": "outbound-studio-demo-1"
  }'
```

The response shape is:

```json
{
  "ok": true,
  "route": "studio_outbound",
  "executionSid": "FN...",
  "status": "active",
  "flowSid": "FW...",
  "from": "+15551239999",
  "to": "+15551230000",
  "handoffId": "outbound-studio-demo-1"
}
```

For this route, configure the ElevenLabs `escalate_to_human` tool URL as:

```text
https://{{system__env_handoff_host}}/studio_escalate
```

The outbound Studio path was tested with Enqueue Call as the final Studio widget. The earlier Send to Flex variant reached the TwiML Redirect `return` transition but failed at the final widget because Send to Flex currently does not support REST API-triggered flows.

## 7. Optional Conversation Memory

Use Twilio Conversation Memory when you want the ElevenLabs agent to access relevant customer context from prior conversations while keeping the same Studio or TaskRouter handoff mechanics. This is an optional overlay on Pattern A, Pattern B, or either outbound handoff path; choose the base routing pattern first, then add Memory.

The main use case is continuity. The caller should not have to repeat what happened last time. Memory can give the ElevenLabs agent relevant prior observations, summaries, preferences, or open issues so it can personalize the conversation and create a better escalation summary.

A second use case is cross-channel context. If the customer previously interacted over SMS, WhatsApp, RCS, chat, voice, or another captured Twilio channel, Conversation Orchestrator can group those communications into conversations and link them to a Memory profile. The ElevenLabs agent can then call the Memory recall tool during the voice call.

Before enabling this path, create a Twilio Conversation Memory Store and make sure the store can resolve profiles by phone number. In production, the usual pattern is to link that store to a Conversation Orchestrator configuration so passive capture can write observations and summaries after conversations complete. You can also write observations, summaries, or traits directly through the Memory API.

### 7.1 Memory, Orchestrator, and Conversation Intelligence

In this blueprint, the Memory path assumes Twilio Conversation Orchestrator is configured for capture and profile resolution. Orchestrator is the layer that turns voice and messaging traffic into normalized conversations, links those conversations to a Memory Store, and can also attach Conversation Intelligence configurations.

Conversation Memory and Conversation Intelligence are independent capabilities. Memory stores and recalls customer context. Conversation Intelligence analyzes conversations for real-time or post-conversation signals such as summaries, sentiment, next-best-response, QA, or custom operator outputs. They can be adopted separately, but both use Conversation Orchestrator as the conversation capture and configuration layer in this pattern.

That means enabling the optional Memory path can also create the foundation for Conversation Intelligence. Once the same Conversation Orchestrator configuration is capturing the relevant voice or messaging traffic, you can attach an Intelligence configuration to run real-time or post-call analysis without changing the ElevenLabs handoff mechanics.

Conversation Memory is not a HIPAA Eligible Service or PCI compliant. Do not use this optional path for workflows that require those controls without a separate compliance review.

### 7.2 Configure Memory Values

Add the Memory values to `serverless/.env`, then redeploy the Twilio Functions:

```text
MEMORY_STORE_ID=mem_store_xxxxxxxxxxxxxxxxxxxxxxxxxx
MEMORY_ID_TYPE=phone
MEMORY_PROFILE_TRAIT_GROUP=Contact
MEMORY_RECALL_OBSERVATIONS_LIMIT=5
MEMORY_RECALL_SUMMARIES_LIMIT=2
MEMORY_RECALL_RELEVANCE_THRESHOLD=0.5
MEMORY_RECALL_LOOKBACK_DAYS=30
```

`MEMORY_STORE_ID` is required for `/memory_recall`. In deployed Twilio Functions, the account SID and auth token are usually available as `ACCOUNT_SID` and `AUTH_TOKEN`, but this repo also supports explicit `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.

`MEMORY_RECALL_OBSERVATIONS_LIMIT`, `MEMORY_RECALL_SUMMARIES_LIMIT`, `MEMORY_RECALL_RELEVANCE_THRESHOLD`, and `MEMORY_RECALL_LOOKBACK_DAYS` are optional but useful for demos or shared test numbers. Small limits keep the voice agent response fast and keep unrelated old context out of the prompt.

After redeploying, the Function Service exposes:

```text
https://your-functions-service-1234.twil.io/memory_recall
```

Unlike the LiveKit version of this blueprint, the ElevenLabs Memory path does not need separate `/voice_memory` or `/studio_voice_memory` entrypoints. `/voice`, `/studio_voice`, and `/outbound` already pass `customer_number` to ElevenLabs as a dynamic variable. The Memory tool sends that customer number to `/memory_recall`, and the Function resolves the Memory profile on demand.

### 7.3 Pre-seed Test Profiles for Passive Capture

When using Conversation Orchestrator passive capture rules, Orchestrator can resolve an existing Memory profile for a caller, but it does not create a brand-new profile for a first-time passive caller. If no profile exists for the caller phone number, the conversation can still be captured and transcribed, but the caller participant may remain `UNKNOWN` with `profileId: null`. In that state, Memory extraction has no customer profile to write observations or summaries into.

For demos and tests, pre-seed a profile for the customer phone number. For inbound tests, this is the phone number you call from. For outbound tests, this is the phone number you call.

```bash
cd serverless
npm run memory:create-profile -- --phone +15551230000
```

The script reads `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `MEMORY_STORE_ID`, `MEMORY_ID_TYPE`, and `MEMORY_PROFILE_TRAIT_GROUP` from `serverless/.env`. You can also pass the store explicitly:

```bash
npm run memory:create-profile -- \
  --phone +15551230000 \
  --memoryStoreId mem_store_xxxxxxxxxxxxxxxxxxxxxxxxxx \
  --name "Alex Customer"
```

The script is idempotent: it looks up the profile by phone first, creates one only if missing, then verifies the lookup. By default it writes the phone trait as `Contact.phone`; set `MEMORY_PROFILE_TRAIT_GROUP` if your Memory Store uses a different trait group.

For production, choose one of these approaches:

- Pre-create or sync customer profiles from your CRM before calls arrive.
- Use active Orchestrator ingestion with explicit `CUSTOMER` participants when you need first-contact profile creation.
- Keep passive capture for low-touch demos where callers are already known in the Memory Store.

### 7.4 Add the ElevenLabs Memory Tool

Create the webhook tool from [elevenlabs/recall-customer-memory-tool.example.json](elevenlabs/recall-customer-memory-tool.example.json). This file uses the ElevenLabs Tools API `tool_config` shape. To create the tool through the API, wrap it in a `tool_config` object:

```bash
jq '{ tool_config: . }' ../elevenlabs/recall-customer-memory-tool.example.json > /tmp/recall-customer-memory-tool.request.json
curl -X POST https://api.elevenlabs.io/v1/convai/tools \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "content-type: application/json" \
  --data @/tmp/recall-customer-memory-tool.request.json
```

If you create the tool in the ElevenLabs UI, use the JSON file as a reference and fill the form fields manually. The UI's "edit JSON" panel can use a different internal shape than the public API.

In the Tools API shape, body properties that use `dynamic_variable` intentionally omit `description`. ElevenLabs accepts only one of `description`, `dynamic_variable`, `is_system_provided`, `constant_value`, or `is_omitted` per string body property.

The tool calls:

```text
https://{{system__env_handoff_host}}/memory_recall
```

The tool uses the same ElevenLabs environment variables as the handoff tool:

```text
handoff_host=your-functions-service-1234.twil.io
handoff_authorization=Bearer <HANDOFF_TOKEN>
```

The tool request body is:

```json
{
  "callerNumber": "{{customer_number}}",
  "query": "recent account access support context"
}
```

The Function looks up the Memory profile by `callerNumber`. For inbound calls, this is the original caller. For outbound calls, this is the customer being called. It then calls Recall for that profile and returns:

```json
{
  "ok": true,
  "profileFound": true,
  "profileId": "mem_profile_xxxxxxxxxxxxxxxxxxxxxxxxxx",
  "memoryContext": "Relevant customer memory:\n- Caller previously reported password reset email delays.",
  "observations": [],
  "summaries": []
}
```

If no profile is found, the response is still successful but `profileFound` is `false` and `memoryContext` is empty. The agent should continue normally.

### 7.5 Add Memory Agent Instructions

For Memory-enabled agents, paste [elevenlabs/agent-prompt-memory.md](elevenlabs/agent-prompt-memory.md) into the ElevenLabs agent prompt instead of the baseline [elevenlabs/agent-prompt.md](elevenlabs/agent-prompt.md).

That prompt keeps the same `escalate_to_human` contract and adds behavior like this so you can confirm the agent is accessing Memory successfully. In production, tune the trigger conditions and wording for your support flow:

```text
If prior customer context would help you avoid asking the caller to repeat themselves, call recall_customer_memory once after the caller describes their issue with a short query for recent, issue-related support context. Use relevant context quietly to ask a better follow-up question or create a better escalation summary. Ignore unrelated or stale memories. Do not mention internal memory systems to the caller, and do not rely on memory as proof of identity or authorization.

Call recall_customer_memory at most once for a given caller issue unless the caller explicitly asks about a different prior topic.

If the caller asks what happened previously, what happened last time, or asks for a summary of a prior conversation, call recall_customer_memory with a query such as recent account access support context or recent account access conversation summary. Then summarize the relevant prior context in one or two sentences. Ignore unrelated or stale memories, even if they are returned. If no relevant prior context is found, say you do not see relevant previous context for this caller and continue helping normally.
```

Attach both tools to the ElevenLabs agent when testing Memory plus escalation:

- `recall_customer_memory` for optional prior context.
- `escalate_to_human` for Studio or TaskRouter handoff.

### 7.6 Verify Memory Recall

Use the ElevenLabs tool execution log or call `/memory_recall` directly with the same bearer token:

```json
{
  "callerNumber": "+15551230000",
  "query": "recent account access support context"
}
```

If `profileFound` is `false`, confirm:

- `MEMORY_STORE_ID` points to the Memory Store linked to your Conversation Orchestrator configuration.
- The caller's phone number is present on a profile as the configured `MEMORY_ID_TYPE`.
- The prior conversation has become inactive or closed so Memory extraction and indexing can complete.

If `profileFound` is `true` but `memoryContext` is empty, try a more specific query, lower the relevance threshold, or wait for extraction/indexing to finish.

## 8. Native ElevenLabs Transfer

ElevenLabs includes native transfer capabilities such as `transfer_to_number`. Use the native tool when the target is simply a phone number or SIP URI and you do not need Twilio to receive the summary or route through Studio/Flex/TaskRouter with custom attributes.

This blueprint focuses on the custom webhook path because it preserves Twilio control of the call after escalation:

- Studio can resume the same Flow execution.
- TaskRouter/Flex can receive structured task attributes.
- The handoff Function updates the original parent Call resource, not a generated child leg.

## 9. How the Patterns Target the Right Call

The important handoff detail is the parent call SID.

When Twilio first sends the live call to ElevenLabs, `/voice`, `/studio_voice`, or `/outbound` passes the active Twilio `CallSid` as:

```text
parent_call_sid
```

When the agent escalates, the ElevenLabs tool sends that value back to Twilio as:

```text
parentCallSid
```

The escalation Function validates that it looks like a Twilio Call SID, then calls the Twilio REST API to update that exact call with new TwiML. This is what moves the live caller or called customer out of the ElevenLabs stream and into Studio, TaskRouter, or Flex.

The raw Twilio leg fields are preserved as `from` and `to`, while the normalized fields identify the customer consistently:

- Inbound: `customerNumber = From`, `twilioNumber = To`.
- Outbound: `customerNumber = To`, `twilioNumber = From`.

Do not substitute an ElevenLabs conversation ID, a child call SID, or a Flex task SID for `parentCallSid`.

## 10. Test End to End

### Pattern A: Studio

1. Point the Twilio number to the Studio Flow.
2. Make sure the Studio TwiML Redirect widget calls `/studio_voice`.
3. Make sure the ElevenLabs Studio tool calls `/studio_escalate`.
4. Call the Twilio number.
5. Ask the agent for a human.
6. Confirm the tool execution posts to `/studio_escalate`.
7. Confirm the original Call is updated with `<Redirect>` back to the Studio Flow webhook and includes `FlowEvent=return`.
8. Confirm Studio continues from the TwiML Redirect `return` transition.
9. Confirm Send to Flex receives `summary`, `intent`, `parentCallSid`, and `handoffId`.

### Pattern B: TaskRouter

1. Point the Twilio number directly to `/voice`.
2. Make sure the ElevenLabs TaskRouter tool calls `/escalate`.
3. Call the Twilio number.
4. Ask the agent for a human.
5. Confirm the tool execution posts to `/escalate`.
6. Confirm the original Call is updated with `<Enqueue workflowSid="WW...">`.
7. Confirm Flex or your TaskRouter assignment callback receives `summary`, `intent`, `parentCallSid`, and `handoffId`.

### Outbound TaskRouter

1. Make sure the ElevenLabs TaskRouter tool calls `/escalate`.
2. Make sure `TWILIO_PHONE_NUMBER`, `FLEX_WORKFLOW_SID`, and `HANDOFF_TOKEN` are configured.
3. Post to `/start_outbound` with a verified or callable customer number.
4. Answer the outbound call.
5. Confirm Twilio invokes `/outbound` and ElevenLabs receives `call_direction=outbound`.
6. Ask the agent for a human.
7. Confirm the tool execution posts to `/escalate`.
8. Confirm the original outbound Call is updated with `<Enqueue workflowSid="WW...">`.
9. Confirm Flex or your TaskRouter assignment callback receives `direction=outbound`, `customerNumber`, `twilioNumber`, `summary`, `intent`, `parentCallSid`, and `handoffId`.
10. Confirm the task also includes `description` and `escalationReason` for the receiving agent.

### Outbound Studio

1. Make sure the outbound Studio Flow uses a REST API Trigger, Make Outgoing Call, TwiML Redirect to `/outbound`, and Enqueue Call with the Flex TaskRouter Workflow.
2. Make sure `STUDIO_OUTBOUND_FLOW_SID`, `STUDIO_OUTBOUND_FLOW_WEBHOOK_URL`, `TWILIO_PHONE_NUMBER`, `FLEX_WORKFLOW_SID`, and `HANDOFF_TOKEN` are configured.
3. Make sure the ElevenLabs Studio tool calls `/studio_escalate`.
4. Post to `/start_studio_outbound` with a verified or callable customer number.
5. Answer the outbound call.
6. Confirm Twilio invokes `/outbound` and ElevenLabs receives `call_direction=outbound`.
7. Ask the agent for a human.
8. Confirm the tool execution posts to `/studio_escalate`.
9. Confirm `/studio_escalate` updates the original outbound Call with a Studio `<Redirect>` that includes `FlowEvent=return`.
10. Confirm Studio resumes from the TwiML Redirect `return` transition and Enqueue Call creates the Flex voice task.
11. Confirm Flex or your TaskRouter assignment callback receives `direction=outbound`, `customerNumber`, `twilioNumber`, `summary`, `intent`, `parentCallSid`, and `handoffId`.

### Useful live checks

List recent calls:

```bash
twilio api:core:calls:list --to "$TWILIO_PHONE_NUMBER" --limit 5 -o json
```

List recent outbound calls from your Twilio number:

```bash
twilio api:core:calls:list --from "$TWILIO_PHONE_NUMBER" --limit 5 -o json
```

Inspect a call's TwiML updates:

```bash
twilio api:core:calls:events:list --call-sid CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx --limit 20 -o json
```

Fetch recent Function logs:

```bash
twilio serverless:logs --service-sid ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx --environment dev -o json
```

### Common troubleshooting

If the agent says the transfer sentence and then the call fails with Twilio's generic application-error message, inspect the call events and confirm `/studio_escalate` redirected to a real `STUDIO_FLOW_WEBHOOK_URL`. A 404 from a `webhooks.twilio.com/.../Flows/FW...` URL usually means the env var still points to a placeholder or unpublished/missing Flow.

If outbound Studio reaches the TwiML Redirect `return` transition and then fails at the final widget with `failedToEnqueue`, confirm the final widget is Enqueue Call, not Send to Flex. As of August 12, 2026, Send to Flex does not support REST API-triggered outbound Studio flows.

If the outbound Studio Enqueue Call widget fails, confirm it is configured with the Flex TaskRouter Workflow SID and task attributes. Do not use a Studio Flow SID or TaskRouter Workspace SID in the Workflow field.

If the agent starts saying the transfer sentence but gets cut off, inspect the ElevenLabs tool configuration and restore `pre_tool_speech=force`, `execution_mode=post_tool_speech`, and `interruption_mode=disable_during_tool`.

## 11. Display Task Attributes in Flex

In Flex, inspect the active task attributes to confirm the handoff payload arrived:

```js
const manager = Twilio.Flex.Manager.getInstance();
[...manager.store.getState().flex.worker.tasks.values()].map((task) => ({
  taskSid: task.taskSid || task.sid,
  status: task.status,
  attributes: task.attributes,
}));
```

Expected attributes include:

```json
{
  "reason": "ai_escalation",
  "direction": "inbound",
  "intent": "account_access",
  "escalationReason": "explicit_request",
  "summary": "Caller is locked out and needs account recovery help.",
  "description": "Caller is locked out and needs account recovery help.",
  "parentCallSid": "CA...",
  "handoffId": "CA...",
  "from": "+15551230000",
  "to": "+15551239999",
  "customerNumber": "+15551230000",
  "twilioNumber": "+15551239999"
}
```

For outbound, expect `direction` and `type` to be `outbound`, with the customer in `customerNumber` and the Twilio number in `twilioNumber`.

## 12. Local Checks

Install dependencies and run tests:

```bash
cd serverless
npm install
npm test
```

The test suite covers:

- ElevenLabs `register-call` request shape.
- Outbound Twilio Calls API starter shape.
- Studio outbound execution starter shape.
- Direction-aware customer and Twilio number metadata.
- Handoff payload validation.
- TaskRouter `<Enqueue>` TwiML generation.
- Direction-aware Studio return `<Redirect>` generation.
- Conversation Memory profile lookup and Recall request shape.
- `/memory_recall` authorization and tool response shape.
- Bearer-token validation.
- `/health` checks for valid TaskRouter workflow SID shape.
