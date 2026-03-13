'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';

interface PeerRecorder {
  userId: string;
  displayName: string;
  recorder: MediaRecorder;
  chunks: Blob[];
}

interface RecordingControlsProps {
  roomId: string;
  peerConnections?: Map<string, { userId: string; displayName: string; stream?: MediaStream }>;
  localDisplayName?: string;
}

export function RecordingControls({
  roomId,
  peerConnections,
  localDisplayName = 'You',
}: RecordingControlsProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [lastRecordingId, setLastRecordingId] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);

  // Mixed recording (fallback)
  const mixedRecorderRef = useRef<MediaRecorder | null>(null);
  const mixedChunksRef = useRef<Blob[]>([]);

  // Per-speaker recorders
  const speakerRecordersRef = useRef<PeerRecorder[]>([]);
  const localRecorderRef = useRef<{ recorder: MediaRecorder; chunks: Blob[] } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const localMicStreamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const rec = await api.post<{ id: string }>(`/recordings/start/${roomId}`);
      setRecordingId(rec.id);

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // Record local mic as a separate speaker track
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localMicStreamRef.current = micStream;

      const localRec = new MediaRecorder(micStream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      const localChunks: Blob[] = [];
      localRec.ondataavailable = (e) => {
        if (e.data.size > 0) localChunks.push(e.data);
      };
      localRecorderRef.current = { recorder: localRec, chunks: localChunks };
      localRec.start(1000);

      // Record each remote peer as a separate speaker track
      const peerRecorders: PeerRecorder[] = [];
      if (peerConnections) {
        for (const [userId, peer] of peerConnections.entries()) {
          if (!peer.stream) continue;
          try {
            const peerRec = new MediaRecorder(peer.stream, {
              mimeType: 'audio/webm;codecs=opus',
            });
            const chunks: Blob[] = [];
            peerRec.ondataavailable = (e) => {
              if (e.data.size > 0) chunks.push(e.data);
            };
            peerRecorders.push({
              userId,
              displayName: peer.displayName || userId,
              recorder: peerRec,
              chunks,
            });
            peerRec.start(1000);
          } catch {
            // Peer stream may not be available yet
          }
        }
      }
      speakerRecordersRef.current = peerRecorders;

      // Also record mixed audio as fallback
      const destination = audioContext.createMediaStreamDestination();
      const micSource = audioContext.createMediaStreamSource(micStream);
      micSource.connect(destination);

      document.querySelectorAll('audio').forEach((el) => {
        try {
          const source = audioContext.createMediaElementSource(el as HTMLAudioElement);
          source.connect(destination);
          source.connect(audioContext.destination);
        } catch {
          // Already connected
        }
      });

      const mixedRecorder = new MediaRecorder(destination.stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      mixedChunksRef.current = [];
      mixedRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) mixedChunksRef.current.push(e.data);
      };

      mixedRecorder.onstop = async () => {
        // Upload mixed recording
        const blob = new Blob(mixedChunksRef.current, { type: 'audio/webm' });
        if (rec.id) {
          await api.post(`/recordings/${rec.id}/stop`);
          await api.uploadFile(`/recordings/${rec.id}/upload`, blob);
        }
      };

      mixedRecorderRef.current = mixedRecorder;
      mixedRecorder.start(1000);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }, [roomId, peerConnections]);

  const stopRecording = useCallback(async () => {
    const currentRecId = recordingId;

    // Stop mixed recorder
    if (mixedRecorderRef.current && mixedRecorderRef.current.state !== 'inactive') {
      mixedRecorderRef.current.stop();
    }

    // Stop and upload local speaker track
    if (localRecorderRef.current) {
      const { recorder, chunks } = localRecorderRef.current;
      await new Promise<void>((resolve) => {
        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          if (currentRecId) {
            const formData = new FormData();
            formData.append('file', blob);
            formData.append('userId', 'self');
            formData.append('speakerName', localDisplayName);
            await fetch(
              `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/recordings/${currentRecId}/upload-speaker-track`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${getToken()}`,
                },
                body: formData,
              },
            ).catch(() => {});
          }
          resolve();
        };
        if (recorder.state !== 'inactive') recorder.stop();
        else resolve();
      });
    }

    // Stop and upload each peer speaker track
    for (const peer of speakerRecordersRef.current) {
      await new Promise<void>((resolve) => {
        peer.recorder.onstop = async () => {
          const blob = new Blob(peer.chunks, { type: 'audio/webm' });
          if (currentRecId) {
            const formData = new FormData();
            formData.append('file', blob);
            formData.append('userId', peer.userId);
            formData.append('speakerName', peer.displayName);
            await fetch(
              `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/recordings/${currentRecId}/upload-speaker-track`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${getToken()}`,
                },
                body: formData,
              },
            ).catch(() => {});
          }
          resolve();
        };
        if (peer.recorder.state !== 'inactive') peer.recorder.stop();
        else resolve();
      });
    }

    // Cleanup
    if (localMicStreamRef.current) {
      localMicStreamRef.current.getTracks().forEach((t) => t.stop());
      localMicStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    speakerRecordersRef.current = [];
    localRecorderRef.current = null;

    setIsRecording(false);
    setLastRecordingId(currentRecId);
    setRecordingId(null);
  }, [recordingId, localDisplayName]);

  const startTranscription = useCallback(async () => {
    if (!lastRecordingId) return;
    setTranscribing(true);
    setTranscription(null);
    try {
      const { id } = await api.post<{ id: string }>(
        `/transcriptions/recording/${lastRecordingId}`,
      );
      const poll = async () => {
        const result = await api.get<{ status: string; text: string | null }>(
          `/transcriptions/${id}`,
        );
        if (result.status === 'COMPLETED') {
          setTranscription(result.text);
          setTranscribing(false);
        } else if (result.status === 'FAILED') {
          setTranscription('Transcription failed');
          setTranscribing(false);
        } else {
          setTimeout(poll, 2000);
        }
      };
      setTimeout(poll, 3000);
    } catch (err) {
      console.error('Transcription failed:', err);
      setTranscribing(false);
    }
  }, [lastRecordingId]);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={isRecording ? 'danger' : 'secondary'}
        onClick={isRecording ? stopRecording : startRecording}
      >
        {isRecording ? 'Stop Recording' : 'Record'}
      </Button>
      {lastRecordingId && !isRecording && (
        <Button
          variant="secondary"
          onClick={startTranscription}
          disabled={transcribing}
        >
          {transcribing ? 'Transcribing...' : 'Transcribe'}
        </Button>
      )}
      {transcription && (
        <span className="max-w-xs truncate text-xs text-gray-600" title={transcription}>
          {transcription}
        </span>
      )}
    </div>
  );
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const stored = localStorage.getItem('auth-storage');
    if (!stored) return '';
    const parsed = JSON.parse(stored);
    return parsed?.state?.token || '';
  } catch {
    return '';
  }
}
