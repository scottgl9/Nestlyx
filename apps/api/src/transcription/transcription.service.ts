import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhisperService, TranscriptionResult } from './whisper.service';

interface SpeakerSegment {
  start: number;
  end: number;
  text: string;
  speaker: string;
}

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  constructor(
    private prisma: PrismaService,
    private whisper: WhisperService,
  ) {}

  async transcribeRecording(recordingId: string) {
    const recording = await this.prisma.recording.findUnique({
      where: { id: recordingId },
      include: { speakerTracks: true },
    });
    if (!recording) throw new NotFoundException('Recording not found');

    const hasSpeakerTracks = recording.speakerTracks.length > 0;
    if (!hasSpeakerTracks && !recording.filePath) {
      throw new NotFoundException('Recording has no audio file');
    }

    // Create transcription entry
    const transcription = await this.prisma.transcription.create({
      data: {
        recordingId,
        status: 'PROCESSING',
        model: this.whisper.getModelName(),
      },
    });

    // Run transcription async (don't block the request)
    if (hasSpeakerTracks) {
      this.runSpeakerTranscription(transcription.id, recording.speakerTracks).catch((err) => {
        this.logger.error(`Transcription ${transcription.id} failed: ${err.message}`);
      });
    } else {
      this.runTranscription(transcription.id, recording.filePath!).catch((err) => {
        this.logger.error(`Transcription ${transcription.id} failed: ${err.message}`);
      });
    }

    return transcription;
  }

  private async runTranscription(transcriptionId: string, filePath: string) {
    try {
      const result = await this.whisper.transcribe(filePath);

      await this.prisma.transcription.update({
        where: { id: transcriptionId },
        data: {
          status: 'COMPLETED',
          text: result.text,
          segments: result.segments as any,
          language: result.language,
        },
      });

      this.logger.log(`Transcription ${transcriptionId} completed`);
    } catch (error: any) {
      await this.prisma.transcription.update({
        where: { id: transcriptionId },
        data: {
          status: 'FAILED',
          error: error.message || 'Unknown error',
        },
      });
    }
  }

  private async runSpeakerTranscription(
    transcriptionId: string,
    speakerTracks: Array<{ userId: string; speakerName: string; filePath: string | null }>,
  ) {
    try {
      // Transcribe each speaker's audio separately
      const speakerResults: Array<{
        speaker: string;
        result: TranscriptionResult;
      }> = [];

      for (const track of speakerTracks) {
        if (!track.filePath) continue;
        this.logger.log(`Transcribing track for speaker: ${track.speakerName}`);
        const result = await this.whisper.transcribe(track.filePath);
        speakerResults.push({ speaker: track.speakerName, result });
      }

      // Merge all segments with speaker labels, sorted by start time
      const allSegments: SpeakerSegment[] = [];
      for (const { speaker, result } of speakerResults) {
        for (const seg of result.segments) {
          allSegments.push({
            start: seg.start,
            end: seg.end,
            text: seg.text,
            speaker,
          });
        }
      }
      allSegments.sort((a, b) => a.start - b.start);

      // Build formatted text with speaker labels
      const formattedText = this.formatSpeakerTranscript(allSegments);

      // Determine language from first result
      const language = speakerResults[0]?.result.language || 'auto';

      await this.prisma.transcription.update({
        where: { id: transcriptionId },
        data: {
          status: 'COMPLETED',
          text: formattedText,
          segments: allSegments as any,
          language,
        },
      });

      this.logger.log(
        `Speaker transcription ${transcriptionId} completed (${speakerResults.length} speakers)`,
      );
    } catch (error: any) {
      await this.prisma.transcription.update({
        where: { id: transcriptionId },
        data: {
          status: 'FAILED',
          error: error.message || 'Unknown error',
        },
      });
    }
  }

  private formatSpeakerTranscript(segments: SpeakerSegment[]): string {
    if (segments.length === 0) return '';

    const lines: string[] = [];
    let currentSpeaker = '';

    for (const seg of segments) {
      if (seg.speaker !== currentSpeaker) {
        currentSpeaker = seg.speaker;
        lines.push(`\n[${currentSpeaker}]`);
      }
      lines.push(seg.text);
    }

    return lines.join(' ').trim();
  }

  async getTranscription(id: string) {
    const transcription = await this.prisma.transcription.findUnique({
      where: { id },
    });
    if (!transcription) throw new NotFoundException('Transcription not found');
    return transcription;
  }

  async listByRecording(recordingId: string) {
    return this.prisma.transcription.findMany({
      where: { recordingId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
