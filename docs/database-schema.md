# Database Schema

## Entity Relationship Diagram

```
User 1──* WorkspaceMember *──1 Workspace
User 1──* Participant *──1 Room
User 1──* ChatMessage
User 1──* Recording
Workspace 1──* Room
Workspace 1──* ChatMessage
Room 1──* Participant
Room 1──* ChatMessage
Room 1──* Recording
Room 1──* MeetingEvent
Recording 1──* SpeakerTrack
Recording 1──* Transcription
```

## Models

### User
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| email | String | Unique |
| displayName | String | |
| passwordHash | String | bcrypt hash |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### Workspace
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| name | String | |
| slug | String | Unique, URL-friendly |
| ownerId | UUID | FK → User |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### WorkspaceMember
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| workspaceId | UUID | FK → Workspace |
| userId | UUID | FK → User |
| role | String | OWNER, ADMIN, MEMBER |
| joinedAt | DateTime | |

Unique constraint: (workspaceId, userId)

### Room
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| workspaceId | UUID | FK → Workspace |
| name | String | |
| inviteCode | UUID | Unique, for join-via-link |
| status | String | IDLE, ACTIVE, ENDED |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### Participant
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| roomId | UUID | FK → Room |
| userId | UUID | FK → User |
| role | String | HOST, MODERATOR, GUEST |
| isMuted | Boolean | Default: false |
| joinedAt | DateTime | |
| leftAt | DateTime? | Null while active |

### ChatMessage
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| roomId | UUID? | FK → Room (null for workspace chat) |
| workspaceId | UUID | FK → Workspace |
| senderId | UUID | FK → User |
| content | String | |
| createdAt | DateTime | |

Indexes: (workspaceId, createdAt), (roomId, createdAt)

### Recording
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| roomId | UUID | FK → Room |
| userId | UUID | FK → User (who started it) |
| status | String | RECORDING, STOPPED, COMPLETED, FAILED |
| filePath | String? | Storage path |
| fileSize | Int? | Bytes |
| duration | Int? | Seconds |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### SpeakerTrack
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| recordingId | UUID | FK → Recording |
| userId | String | ID of the speaker |
| speakerName | String | Display name used as transcript label |
| filePath | String? | Storage path to the audio file |
| fileSize | Int? | Bytes |
| createdAt | DateTime | |

One row per participant per recording. Used by `TranscriptionService` to produce speaker-attributed transcripts.

### Transcription
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| recordingId | UUID | FK → Recording |
| status | String | PENDING, PROCESSING, COMPLETED, FAILED |
| language | String? | Detected or specified language code |
| text | String? | Full transcript text |
| segments | JSON? | Array of `{ start, end, text, speaker? }` objects |
| model | String | Whisper model name used (default: `base`) |
| error | String? | Error message if status is FAILED |
| createdAt | DateTime | |
| updatedAt | DateTime | |

When speaker tracks are present, `text` contains `[SpeakerName]`-labeled turns and `segments` includes a `speaker` field on each segment. Language is detected by Whisper from the first speaker track processed.

### MeetingEvent
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| roomId | UUID | FK → Room |
| type | String | Event type enum |
| actorId | UUID? | FK → User |
| metadata | JSON | Additional data |
| createdAt | DateTime | |

Index: (roomId, createdAt)
