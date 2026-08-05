## ElevenLabs Agent Setup

1. Create or choose an ElevenLabs Conversational Agent.
2. Set Twilio-compatible audio formats for register-call telephony: mu-law 8000 Hz input and output.
3. Add dynamic variables named `parent_call_sid`, `handoff_id`, `routing_mode`, `caller_number`, and `called_number`.
4. Add a secret or environment variable for the deployed Twilio Functions host.
5. Add a secret for `HANDOFF_TOKEN`.
6. Create the webhook tool from `elevenlabs/escalate-to-human-tool.example.json`.
7. Attach the webhook tool to the agent through the current ElevenLabs `tool_ids` mechanism.
8. Paste the instructions from `elevenlabs/agent-prompt.md` into the agent prompt.
9. Use the ElevenLabs test console to confirm the tool receives the dynamic `parentCallSid` value before testing a real Twilio call.
