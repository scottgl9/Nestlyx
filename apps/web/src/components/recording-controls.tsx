'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';

interface RecordingControlsProps {
  roomId: string;
}

export function RecordingControls({ roomId }: RecordingControlsProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      // Create recording entry on server
      const rec = await api.post<{ id: string }>(`/recordings/start/${roomId}`);
      setRecordingId(rec.id);

      // Capture audio from all audio elements on the page
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();

      // Get local mic audio
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const micSource = audioContext.createMediaStreamSource(micStream);
      micSource.connect(destination);

      // Capture remote audio from audio elements
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach((el) => {
        try {
          const source = audioContext.createMediaElementSource(el as HTMLAudioElement);
          source.connect(destination);
          source.connect(audioContext.destination);
        } catch {
          // Element may already be connected
        }
      });

      const mediaRecorder = new MediaRecorder(destination.stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (rec.id) {
          await api.post(`/recordings/${rec.id}/stop`);
          await api.uploadFile(`/recordings/${rec.id}/upload`, blob);
        }
        micStream.getTracks().forEach((t) => t.stop());
        audioContext.close();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }, [roomId]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setLastRecordingId(recordingId);
    setRecordingId(null);
  }, [recordingId]);

  const [lastRecordingId, setLastRecordingId] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);

  const startTranscription = useCallback(async () => {
    if (!lastRecordingId) return;
    setTranscribing(true);
    setTranscription(null);
    try {
      const { id } = await api.post<{ id: string }>(
        `/transcriptions/recording/${lastRecordingId}`,
      );
      // Poll for completion
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
