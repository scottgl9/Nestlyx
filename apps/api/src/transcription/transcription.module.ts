import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TranscriptionService } from './transcription.service';
import { TranscriptionController } from './transcription.controller';
import { WhisperService } from './whisper.service';

@Module({
  imports: [ConfigModule],
  providers: [TranscriptionService, WhisperService],
  controllers: [TranscriptionController],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
