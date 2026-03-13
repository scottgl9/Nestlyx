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
    setRecordingId(null);
  }, []);

  return (
    <Button
      variant={isRecording ? 'danger' : 'secondary'}
      onClick={isRecording ? stopRecording : startRecording}
    >
      {isRecording ? 'Stop Recording' : 'Record'}
    </Button>
  );
}
