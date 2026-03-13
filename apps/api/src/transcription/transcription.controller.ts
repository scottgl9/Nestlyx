import { Controller, Get, Post, Param } from '@nestjs/common';
import { TranscriptionService } from './transcription.service';

@Controller('transcriptions')
export class TranscriptionController {
  constructor(private transcriptionService: TranscriptionService) {}

  @Post('recording/:recordingId')
  async transcribeRecording(@Param('recordingId') recordingId: string) {
    return this.transcriptionService.transcribeRecording(recordingId);
  }

  @Get(':id')
  async getTranscription(@Param('id') id: string) {
    return this.transcriptionService.getTranscription(id);
  }

  @Get('recording/:recordingId')
  async listByRecording(@Param('recordingId') recordingId: string) {
    return this.transcriptionService.listByRecording(recordingId);
  }
}
