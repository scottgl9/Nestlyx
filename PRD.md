# Product Requirements Document (PRD)

## Product Name
**Nestlyx** (working name)

## Version
v0.2 (Draft)

## Author
Scott Glover (+ Artisan)

## Date
2026-03-13

---

## 1) Executive Summary
Nestlyx is an open-source, self-hostable meeting platform (Teams/Zoom-class core experience) with **built-in local-first recording, transcription, summarization, and AI bot participation**.

This PRD explicitly includes first-class integration for **OpenClaw (and other agent frameworks)** to consume real-time speaker-attributed transcripts and to speak in meetings via TTS when enabled by meeting policy.

Unlike existing fragmented stacks (video in one tool, transcription in another, AI notes in cloud SaaS), OpenMeet AI provides a unified product where organizations can keep audio/video/text data fully under their control.

---

## 2) Problem Statement
Teams want:
- Reliable meetings (video/audio/chat/screen share)
- Accurate notes and action items
- Optional AI participation (Q&A and spoken responses)
- Strong privacy/compliance posture

Current options are either:
1. Open-source conferencing without polished built-in local AI workflows, or
2. Proprietary cloud note-takers with data leaving customer infrastructure.

This creates a gap for a production-grade, privacy-first OSS product with native AI collaboration features.

---

## 3) Goals and Non-Goals

### Goals (v1 MVP)
1. Deliver stable, self-hosted collaboration platform for small/medium teams with clear frontend/backend separation.
2. Support core collaboration primitives: workspace chat + 1:1/group voice calls.
3. Record voice calls and generate transcripts locally by default.
4. Provide live and post-call AI notes (summary, decisions, action items).
5. Enable an in-call AI bot that can:
   - Join/leave calls
   - Answer text prompts
   - Speak responses with TTS
6. Provide a stable agent integration contract so OpenClaw can subscribe to live transcripts with speaker identity metadata.
7. Keep architecture modular so users can swap STT/LLM/TTS providers.

### Non-Goals (v1 MVP)
- Full enterprise parity with Microsoft Teams (channels/files/telephony/PSTN).
- Built-in video calling (planned for Phase 2).
- Multi-region geo-distributed failover.
- Complex workflow automation marketplace.
- Native mobile apps beyond responsive web (defer to v2+).

---

## 4) Target Users

### Primary
- Privacy-conscious engineering teams
- Startups/self-hosters
- Education and nonprofit orgs needing low-cost meeting intelligence

### Secondary
- Regulated teams that require on-prem/local processing
- OSS communities and remote project maintainers

---

## 5) Core Value Proposition
- **Self-hosted + open source**
- **Local-first AI pipeline** (Whisper/faster-whisper + local LLM + local/edge TTS)
- **One integrated UX** (meet, record, transcribe, summarize, ask bot, hear bot)
- **Extensible providers** for organizations that want hybrid cloud fallback

---

## 6) User Stories

1. As a host, I can create a meeting link and invite participants quickly.
2. As a participant, I can join in-browser without installing clients.
3. As a host, I can enable recording and transcription with one click.
4. As a participant, I can view live captions during the meeting.
5. As a team lead, I can receive a post-meeting summary with decisions and action items.
6. As a participant, I can ask the AI bot “What did we decide about X?” and get contextual answers.
7. As a host, I can allow the bot to speak responses using TTS.
8. As an admin, I can keep all processing local and disable cloud calls.
9. As an admin, I can configure model providers and retention policies.

---

## 7) Functional Requirements

## 7.1 Meeting Core (v1 MVP)
- Create/join voice calls via URL
- Audio controls (mute/unmute, input/output selection)
- In-workspace and in-call chat
- Participant list and role-based permissions (host/moderator/guest)
- Backend APIs for rooms, participants, chat, and call state
- Frontend web client for chat + voice calling

### 7.1.1 Video Calling (Phase 2)
- Add participant video streams to existing call model
- Add camera controls and basic grid layout
- Preserve transcript/speaker identity model from v1

## 7.2 Recording
- Host-controlled start/stop recording
- Store recordings in local object/file storage
- Meeting timeline metadata (timestamps/events)

## 7.3 Transcription (STT)
- Near-real-time transcription from meeting audio
- Identity-bound speaker attribution for each utterance (human and bot), sourced from platform participant/session identity.
- Speaker identity must come from authenticated media track ownership in the platform, not from AI guessing.
- Speaker diarization is fallback only for exceptional recovery scenarios (e.g., corrupted/missing track metadata), and must be flagged as inferred.
- Post-meeting transcript export (TXT, VTT, JSON)
- Default local model path (Whisper-compatible)

## 7.4 AI Notes and Summaries
- Generate:
  - Executive summary
  - Decisions
  - Action items (owner, due date optional)
  - Open questions
- Regenerate summary with configurable prompt templates

## 7.5 AI Meeting Bot
- Bot identity visible in participant roster
- Text interaction in side panel/chat
- Context-aware answering against meeting transcript buffer
- Optional TTS voice playback to room
- TTS engine support with **Chatterbox** as default v1 implementation
- “Raise hand / wait turn” behavior to reduce interruptions
- Host-level policy: mute bot, allow bot speak, allow autonomous replies, require approval before speaking

## 7.6 Admin and Governance
- Workspace/project-level settings
- Retention policy controls for media/transcripts/summaries
- AI provider configuration (local only / hybrid)
- Audit log for key actions (recording start/stop, exports, bot speaking)

## 7.7 Integrations (v1 lite)
- Webhook on meeting end with summary payload
- Calendar import (ICS) for scheduled meetings

## 7.8 Speaker Identity Mapping for AI Agents (OpenClaw + others)
- Platform is the source of truth for speaker identity. Transcript attribution must be derived from authenticated participant/session ownership of each media track.
- Provide a real-time event/API stream that includes `speaker_id`, `speaker_name`, `speaker_type` (`human|bot`), `participant_id`, `is_verified_identity`, and timestamp bounds per utterance.
- Each participant audio track must be bound to authenticated meeting identity at ingest.
- Bot participants must be represented exactly like humans in roster + transcript metadata, with explicit `speaker_type=bot`.
- Expose canonical participant mapping endpoint so agents can resolve aliases/display names to stable IDs.
- Support reconnect continuity so a participant rejoin preserves same logical speaker identity for transcript attribution.
- Provide confidence + attribution source fields (e.g., `source=platform_track_binding|diarization_fallback`) for downstream agent decisioning.
- Provide correction API for moderators to relabel misattributed segments; corrected mapping is reflected in downstream exports/events.

## 7.9 OpenClaw Agent Integration
- Feature flag: `enable_agent_streaming` at workspace and meeting level.
- When enabled, system must stream live transcript segments to registered agent clients over WebSocket or SSE.
- Event payload minimum:
  - `meeting_id`, `utterance_id`, `speaker_id`, `speaker_name`, `speaker_type`, `text`, `start_ms`, `end_ms`, `confidence`, `final`.
- Delivery guarantees:
  - ordered per meeting partition,
  - at-least-once delivery with idempotency key (`utterance_id`),
  - replay window for reconnecting agents.
- Agent auth:
  - scoped API keys/service accounts,
  - per-meeting authorization,
  - revocation support.
- Agent voice control API:
  - submit text to speak,
  - select voice profile,
  - optional host approval workflow,
  - emit bot speech events back into transcript stream as `speaker_type=bot`.

---

## 8) Non-Functional Requirements
- **Privacy:** local processing by default; no forced external API calls.
- **Security:** TLS in transit, encrypted storage at rest (configurable), RBAC.
- **Performance:** support 25 concurrent participants in v1 target deployment profile.
- **Latency:** live transcript lag target < 3 seconds on recommended hardware.
- **Reliability:** 99.5% uptime target for single-node self-host deployment.
- **Observability:** metrics, logs, health checks.

---

## 9) Compliance and Trust Requirements
- Explicit consent indicators when recording/transcription are active.
- Bot must be clearly labeled as non-human participant.
- Configurable data retention and deletion workflows.
- Export/delete per meeting to support internal compliance workflows.

---

## 10) UX Requirements
- One-click “Enable AI assistant” in meeting room.
- Live transcript panel with speaker tags and timestamps.
- Post-meeting “Meeting Pack” page:
  - Recording link
  - Full transcript
  - AI summary
  - Decisions/actions list
- Bot interaction panel with text input + “Speak answer” toggle.

---

## 11) Technical Architecture (v1)

### Proposed components
1. **Frontend:** Web app (React/Next.js)
2. **Realtime media:** WebRTC SFU (e.g., LiveKit/mediasoup)
3. **Meeting service API:** room/user/session controls
4. **Recording worker:** captures mixed/individual streams
5. **Speaker attribution service:** binds audio tracks to authenticated participant identity and emits speaker events
6. **STT worker:** OpenAI Whisper local endpoint (default v1) with optional faster-whisper backend profile
7. **LLM worker:** local model via Ollama/vLLM-compatible API
8. **TTS worker:** Chatterbox (default v1) with pluggable TTS provider interface
9. **Agent gateway:** OpenClaw-compatible streaming/events API + bot speech control API
10. **Storage:** Postgres + object storage (S3-compatible/MinIO/local)
11. **Queue/Event bus:** Redis/NATS for async processing

### Deployment modes
- Single-node Docker Compose (developer/small team)
- Kubernetes Helm chart (production)

---

## 12) Success Metrics (KPIs)

### Adoption
- # active workspaces
- Weekly active meetings
- AI assistant enablement rate

### Quality
- Transcript WER (benchmarked sample set)
- Summary usefulness rating (thumbs up/down)
- Bot response latency (p95)

### Reliability
- Meeting failure rate
- Recording success rate
- Processing job completion success

---

## 13) Milestones and Scope Phasing

## Phase 1 (0–30 days): Foundation (MVP)
- Self-hostable frontend + backend baseline
- Chat + voice call core (join, audio controls, participant roles)
- Local recording
- Initial deployment docs

## Phase 2 (31–60 days): AI Core + Video Introduction
- STT pipeline + transcript UI
- Post-call summary generation
- Add video calling to existing voice call architecture
- Retention and export basics

## Phase 3 (61–90 days): Bot Participation + Hardening
- In-call AI chat assistant
- TTS response playback
- OpenClaw agent streaming and bot voice controls
- Admin controls + audit logging
- v1 hardening and release candidate

---

## 14) Risks and Mitigations
1. **Compute cost for local AI**
   - Mitigation: model tiers, CPU/GPU profiles, batching, async summaries.
2. **Transcript quality variability**
   - Mitigation: language/model settings, noise suppression, user correction flow.
3. **Bot interruptions/disruption**
   - Mitigation: turn-taking logic, host-only speak controls, cooldowns.
4. **Feature creep toward “full Teams clone”**
   - Mitigation: strict v1 scope and milestone gates.

---

## 15) Open Questions
1. Should v1 prioritize LiveKit or mediasoup for fastest delivery?
2. Is diarization mandatory for launch or best-effort acceptable?
3. Which local TTS engine should be default (quality vs speed)?
4. Should summaries be generated live continuously or only on-demand/end-of-meeting?
5. What minimum hardware profile should be officially supported?

---

## 16) Definition of Done (v1)
- Users can run real collaboration sessions with stable chat + voice calling (video added in Phase 2 scope).
- Recording and transcript generated locally and reliably.
- AI summary and action items available within 2 minutes of meeting end (target profile).
- Bot can answer transcript-grounded questions and speak via TTS when permitted.
- OpenClaw (or another external agent) can reliably determine who is speaking from real-time and exported transcript metadata.
- Security/privacy controls are documented and test-verified.
- Public OSS repo includes install docs, architecture docs, and contributor guide.

---

## 17) Appendix: Suggested MVP Positioning
**Tagline:** “Open-source meetings with private AI teammate built in.”

**Launch message:**
- Self-hosted video meetings
- Local transcription and summaries
- AI bot that can listen, take notes, and speak when invited
- No mandatory cloud dependency
