# Twilio ElevenLabs Call Handoff Blueprint

Conversational AI agents need a clean way to escalate to a human when they cannot resolve an interaction on their own.

This repo is a working blueprint for handing an active phone call from an ElevenLabs Conversational AI agent back to Twilio, then routing that caller to a human with context. The tested destinations are Twilio Studio, TaskRouter, and Flex. The core pattern is broader: pass the original Twilio parent `CallSid` into ElevenLabs as a dynamic variable, let the ElevenLabs agent decide when to escalate, then update that original Twilio Call resource with the next TwiML instruction.

Flex is the reference human-agent destination in this repo. Pattern A uses Studio to resume the journey and then Send to Flex. Pattern B sends the caller directly to TaskRouter/Flex with `<Enqueue>`. The same parent-call update pattern can be adapted to another TaskRouter-powered contact center.

This blueprint intentionally uses ElevenLabs `register-call` and a custom ElevenLabs webhook tool. It does not rely on ElevenLabs native `transfer_to_number` as the primary path, because native transfer is best for simple blind transfer to a configured phone number or SIP URI. The goal here is Twilio-owned routing with handoff context: summary, intent, reason, original caller, original called number, parent call SID, and handoff ID.

The repo has been exercised end to end with both included handoff paths:

- **Studio path:** Twilio number starts a Studio Flow, Studio calls `/studio_voice`, ElevenLabs calls `/studio_escalate`, and the call returns to the same Studio execution before Send to Flex.
- **TaskRouter path:** Twilio number calls `/voice`, ElevenLabs calls `/escalate`, and the original parent call is updated with `<Enqueue>` for Flex or another TaskRouter-powered contact center.

> **Proof of concept.** This blueprint is intended as a working reference implementation, not a production drop-in. Before using it in production, adapt the routing, authentication, prompts, observability, error handling, security controls, data-retention behavior, and compliance posture to your use case.

## Index

- [1. Prerequisites](#1-prerequisites)
- [2. Choose the Escalation Pattern](#2-choose-the-escalation-pattern)
- [3. Shared Setup](#3-shared-setup)
  - [3.1 Deploy the Twilio Functions](#31-deploy-the-twilio-functions)
  - [3.2 Configure the ElevenLabs Agent](#32-configure-the-elevenlabs-agent)
  - [3.3 Configure the ElevenLabs Tool](#33-configure-the-elevenlabs-tool)
- [4. Pattern A Setup: Using Studio](#4-pattern-a-setup-using-studio)
- [5. Pattern B Setup: Using TaskRouter](#5-pattern-b-setup-using-taskrouter)
- [6. Optional Conversation Memory](#6-optional-conversation-memory)
- [7. Native ElevenLabs Transfer](#7-native-elevenlabs-transfer)
- [8. How the Patterns Target the Right Call](#8-how-the-patterns-target-the-right-call)
- [9. Test End to End](#9-test-end-to-end)
- [10. Display Task Attributes in Flex](#10-display-task-attributes-in-flex)
- [11. Local Checks](#11-local-checks)

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

Use **ElevenLabs native transfer** when the desired outcome is simply "send this caller to a phone number or SIP URI" and you do not need Twilio to receive the summary or control Studio/Flex/TaskRouter routing.

The repo includes both tested Function pairs:

- [serverless/functions/studio_voice.js](serverless/functions/studio_voice.js): Pattern A entrypoint called by the Studio TwiML Redirect widget.
- [serverless/functions/studio_escalate.js](serverless/functions/studio_escalate.js): Pattern A handoff endpoint called by the ElevenLabs webhook tool.
- [serverless/functions/voice.js](serverless/functions/voice.js): Pattern B entrypoint called directly by the Twilio number webhook.
- [serverless/functions/escalate.js](serverless/functions/escalate.js): Pattern B handoff endpoint called by the ElevenLabs webhook tool.

A single Twilio phone number can be pointed at one incoming voice target at a time. To test Pattern A, route the number to the Studio Flow. To test Pattern B, route the same number directly to `/voice`.

The ElevenLabs webhook tool also has one webhook URL at a time. To preserve the same explicit pattern as the LiveKit blueprint, configure separate tools or separate agents for Pattern A and Pattern B:

- Pattern A tool URL: `https://{{system__env_handoff_host}}/studio_escalate`
- Pattern B tool URL: `https://{{system__env_handoff_host}}/escalate`

If you point a Studio-started call at `/studio_voice` but the ElevenLabs tool still calls `/escalate`, the call can still reach Flex. However, Studio will not resume through the TwiML Redirect `return` transition; `/escalate` bypasses Studio and enqueues directly.

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

# Optional Conversation Memory.
MEMORY_STORE_ID=
MEMORY_ID_TYPE=phone
MEMORY_RECALL_OBSERVATIONS_LIMIT=5
MEMORY_RECALL_SUMMARIES_LIMIT=2
MEMORY_RECALL_RELEVANCE_THRESHOLD=
MEMORY_RECALL_LOOKBACK_DAYS=
```

`FLEX_WORKFLOW_SID` is required for Pattern B. `STUDIO_FLOW_WEBHOOK_URL` is required for Pattern A. If you create the Studio Flow after the first Function deployment, add the Flow webhook URL to `serverless/.env` and deploy again.

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
```

The `/voice` and `/studio_voice` Functions set those values through ElevenLabs `register-call`:

```json
{
  "type": "conversation_initiation_client_data",
  "dynamic_variables": {
    "parent_call_sid": "CA...",
    "handoff_id": "CA...",
    "caller_number": "+15551230000",
    "called_number": "+15551239999"
  }
}
```

`parent_call_sid` is the original inbound Twilio Call SID. It is the value the escalation Function updates. `handoff_id` is a correlation field for Flex attributes, logs, and analytics. The sample defaults it to the parent call SID if no separate handoff ID is provided.

Paste [elevenlabs/agent-prompt.md](elevenlabs/agent-prompt.md) into the agent prompt. If you want to test both Pattern A and Pattern B with the same ElevenLabs agent, attach both tools and make their names/descriptions explicit enough for the model to choose the right one in that test. For the simplest reproduction, use one agent/tool configuration per pattern.

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

Create the webhook tool from [elevenlabs/escalate-to-human-tool.example.json](elevenlabs/escalate-to-human-tool.example.json). The example includes the timing settings used for voice handoff:

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
  "intent": "{{widgets.redirect_to_elevenlabs.intent}}",
  "summary": "{{widgets.redirect_to_elevenlabs.summary}}",
  "description": "{{widgets.redirect_to_elevenlabs.description}}",
  "parentCallSid": "{{widgets.redirect_to_elevenlabs.parentCallSid}}",
  "handoffId": "{{widgets.redirect_to_elevenlabs.handoffId}}"
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

## 6. Optional Conversation Memory

Use Twilio Conversation Memory when you want the ElevenLabs agent to access relevant customer context from prior conversations while keeping the same Studio or TaskRouter handoff mechanics. This is an optional overlay on Pattern A or Pattern B; choose the base routing pattern first, then add Memory.

The main use case is continuity. The caller should not have to repeat what happened last time. Memory can give the ElevenLabs agent relevant prior observations, summaries, preferences, or open issues so it can personalize the conversation and create a better escalation summary.

A second use case is cross-channel context. If the customer previously interacted over SMS, WhatsApp, RCS, chat, voice, or another captured Twilio channel, Conversation Orchestrator can group those communications into conversations and link them to a Memory profile. The ElevenLabs agent can then call the Memory recall tool during the voice call.

Before enabling this path, create a Twilio Conversation Memory Store and make sure the store can resolve profiles by phone number. In production, the usual pattern is to link that store to a Conversation Orchestrator configuration so passive capture can write observations and summaries after conversations complete. You can also write observations, summaries, or traits directly through the Memory API.

### 6.1 Memory, Orchestrator, and Conversation Intelligence

In this blueprint, the Memory path assumes Twilio Conversation Orchestrator is configured for capture and profile resolution. Orchestrator is the layer that turns voice and messaging traffic into normalized conversations, links those conversations to a Memory Store, and can also attach Conversation Intelligence configurations.

Conversation Memory and Conversation Intelligence are independent capabilities. Memory stores and recalls customer context. Conversation Intelligence analyzes conversations for real-time or post-conversation signals such as summaries, sentiment, next-best-response, QA, or custom operator outputs. They can be adopted separately, but both use Conversation Orchestrator as the conversation capture and configuration layer in this pattern.

That means enabling the optional Memory path can also create the foundation for Conversation Intelligence. Once the same Conversation Orchestrator configuration is capturing the relevant voice or messaging traffic, you can attach an Intelligence configuration to run real-time or post-call analysis without changing the ElevenLabs handoff mechanics.

Conversation Memory is not a HIPAA Eligible Service or PCI compliant. Do not use this optional path for workflows that require those controls without a separate compliance review.

### 6.2 Configure Memory Values

Add the Memory values to `serverless/.env`, then redeploy the Twilio Functions:

```text
MEMORY_STORE_ID=mem_store_xxxxxxxxxxxxxxxxxxxxxxxxxx
MEMORY_ID_TYPE=phone
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

Unlike the LiveKit version of this blueprint, the ElevenLabs Memory path does not need separate `/voice_memory` or `/studio_voice_memory` entrypoints. `/voice` and `/studio_voice` already pass `caller_number` to ElevenLabs as a dynamic variable. The Memory tool sends that caller number to `/memory_recall`, and the Function resolves the Memory profile on demand.

### 6.3 Add the ElevenLabs Memory Tool

Create the webhook tool from [elevenlabs/recall-customer-memory-tool.example.json](elevenlabs/recall-customer-memory-tool.example.json). It calls:

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
  "callerNumber": "{{caller_number}}",
  "query": "recent account access support context"
}
```

The Function looks up the Memory profile by `callerNumber`, calls Recall for that profile, and returns:

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

### 6.4 Add Memory Agent Instructions

For testing and demos, add behavior like this to the ElevenLabs agent prompt so you can confirm the agent is accessing Memory successfully. In production, tune the trigger conditions and wording for your support flow:

```text
If prior customer context would help you avoid asking the caller to repeat themselves, call recall_customer_memory once after the caller describes their issue with a short query for recent, issue-related support context. Use relevant context quietly to ask a better follow-up question or create a better escalation summary. Ignore unrelated or stale memories. Do not mention internal memory systems to the caller, and do not rely on memory as proof of identity or authorization.

If the caller asks what happened previously, what happened last time, or asks for a summary of a prior conversation, call recall_customer_memory with a query such as recent account access support context or recent account access conversation summary. Then summarize the relevant prior context in one or two sentences. Ignore unrelated or stale memories, even if they are returned. If no relevant prior context is found, say you do not see relevant previous context for this caller and continue helping normally.
```

Attach both tools to the ElevenLabs agent when testing Memory plus escalation:

- `recall_customer_memory` for optional prior context.
- `escalate_to_human` for Studio or TaskRouter handoff.

### 6.5 Verify Memory Recall

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

## 7. Native ElevenLabs Transfer

ElevenLabs includes native transfer capabilities such as `transfer_to_number`. Use the native tool when the target is simply a phone number or SIP URI and you do not need Twilio to receive the summary or route through Studio/Flex/TaskRouter with custom attributes.

This blueprint focuses on the custom webhook path because it preserves Twilio control of the call after escalation:

- Studio can resume the same Flow execution.
- TaskRouter/Flex can receive structured task attributes.
- The handoff Function updates the original parent Call resource, not a generated child leg.

## 8. How the Patterns Target the Right Call

The important handoff detail is the parent call SID.

When Twilio first sends the caller to ElevenLabs, `/voice` or `/studio_voice` passes the original inbound `CallSid` as:

```text
parent_call_sid
```

When the agent escalates, the ElevenLabs tool sends that value back to Twilio as:

```text
parentCallSid
```

The escalation Function validates that it looks like a Twilio Call SID, then calls the Twilio REST API to update that exact call with new TwiML. This is what moves the live caller out of the ElevenLabs stream and into Studio, TaskRouter, or Flex.

Do not substitute an ElevenLabs conversation ID, a child call SID, or a Flex task SID for `parentCallSid`.

## 9. Test End to End

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

### Useful live checks

List recent calls:

```bash
twilio api:core:calls:list --to "$TWILIO_PHONE_NUMBER" --limit 5 -o json
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

If the agent starts saying the transfer sentence but gets cut off, inspect the ElevenLabs tool configuration and restore `pre_tool_speech=force`, `execution_mode=post_tool_speech`, and `interruption_mode=disable_during_tool`.

## 10. Display Task Attributes in Flex

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
  "intent": "account_access",
  "summary": "Caller is locked out and needs account recovery help.",
  "parentCallSid": "CA...",
  "handoffId": "CA...",
  "from": "+15551230000",
  "to": "+15551239999"
}
```

## 11. Local Checks

Install dependencies and run tests:

```bash
cd serverless
npm install
npm test
```

The test suite covers:

- ElevenLabs `register-call` request shape.
- Handoff payload validation.
- TaskRouter `<Enqueue>` TwiML generation.
- Studio return `<Redirect>` generation.
- Conversation Memory profile lookup and Recall request shape.
- `/memory_recall` authorization and tool response shape.
- Bearer-token validation.
- `/health` checks for valid TaskRouter workflow SID shape.
