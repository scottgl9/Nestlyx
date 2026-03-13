import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhisperService } from './whisper.service';

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
    });
    if (!recording) throw new NotFoundException('Recording not found');
    if (!recording.filePath) {
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
    this.runTranscription(transcription.id, recording.filePath).catch((err) => {
      this.logger.error(`Transcription ${transcription.id} failed: ${err.message}`);
    });

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
