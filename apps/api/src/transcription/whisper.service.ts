import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { nodewhisper } from 'nodejs-whisper';
import * as fs from 'fs';
import * as path from 'path';

export interface TranscriptionResult {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  language: string;
}

@Injectable()
export class WhisperService implements OnModuleInit {
  private readonly logger = new Logger(WhisperService.name);
  private modelName: string;

  constructor(private config: ConfigService) {
    this.modelName = config.get<string>('WHISPER_MODEL', 'base');
  }

  async onModuleInit() {
    this.logger.log(
      `Whisper STT configured with model: ${this.modelName}`,
    );
    this.logger.log(
      'Run "npx nodejs-whisper download" to download the model if not already present',
    );
  }

  async transcribe(audioFilePath: string, language?: string): Promise<TranscriptionResult> {
    if (!fs.existsSync(audioFilePath)) {
      throw new Error(`Audio file not found: ${audioFilePath}`);
    }

    this.logger.log(`Starting transcription: ${path.basename(audioFilePath)} (model: ${this.modelName})`);

    const startTime = Date.now();

    try {
      const result = await nodewhisper(audioFilePath, {
        modelName: this.modelName,
        autoDownloadModelName: this.modelName,
        whisperOptions: {
          outputInJson: true,
          language: language || 'auto',
          wordTimestamps: true,
        },
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(`Transcription completed in ${elapsed}s`);

      // nodejs-whisper returns the text content directly as a string
      // Parse the JSON output if available, otherwise return raw text
      const parsed = this.parseWhisperOutput(result, audioFilePath);
      return parsed;
    } catch (error) {
      this.logger.error(`Transcription failed: ${error}`);
      throw error;
    }
  }

  private parseWhisperOutput(rawOutput: string, audioFilePath: string): TranscriptionResult {
    // nodejs-whisper writes JSON output to a file alongside the audio
    // Try to read the JSON output file first
    const jsonPath = audioFilePath + '.json';
    if (fs.existsSync(jsonPath)) {
      try {
        const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        const segments = (jsonContent.transcription || []).map((seg: any) => ({
          start: this.parseTimestamp(seg.timestamps?.from || '00:00:00'),
          end: this.parseTimestamp(seg.timestamps?.to || '00:00:00'),
          text: (seg.speech || seg.text || '').trim(),
        }));

        // Clean up the JSON output file
        fs.unlinkSync(jsonPath);

        return {
          text: segments.map((s: any) => s.text).join(' ').trim(),
          segments,
          language: jsonContent.params?.language || 'auto',
        };
      } catch {
        // Fall through to raw text parsing
      }
    }

    // Fallback: return raw output as plain text
    return {
      text: rawOutput.trim(),
      segments: [],
      language: 'auto',
    };
  }

  private parseTimestamp(ts: string): number {
    // Parse "HH:MM:SS.mmm" or "HH:MM:SS" to seconds
    const parts = ts.split(':');
    if (parts.length === 3) {
      return (
        parseInt(parts[0]) * 3600 +
        parseInt(parts[1]) * 60 +
        parseFloat(parts[2])
      );
    }
    return 0;
  }

  getModelName(): string {
    return this.modelName;
  }
}
