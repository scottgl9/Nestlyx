import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WhisperService } from './whisper.service';

// Mock nodejs-whisper
jest.mock('nodejs-whisper', () => ({
  nodewhisper: jest.fn(),
}));

import { nodewhisper } from 'nodejs-whisper';
import * as fs from 'fs';

jest.mock('fs');

describe('WhisperService', () => {
  let service: WhisperService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhisperService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('base'),
          },
        },
      ],
    }).compile();

    service = module.get<WhisperService>(WhisperService);
  });

  describe('getModelName', () => {
    it('should return the configured model name', () => {
      expect(service.getModelName()).toBe('base');
    });
  });

  describe('transcribe', () => {
    it('should throw if audio file does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await expect(service.transcribe('/nonexistent.webm')).rejects.toThrow(
        'Audio file not found',
      );
    });

    it('should call nodewhisper and return parsed result', async () => {
      (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
        // File exists for the audio, but not for the JSON output
        return path === '/test.webm';
      });

      (nodewhisper as jest.Mock).mockResolvedValue('Hello world transcription');

      const result = await service.transcribe('/test.webm');

      expect(result.text).toBe('Hello world transcription');
      expect(nodewhisper).toHaveBeenCalledWith('/test.webm', expect.objectContaining({
        modelName: 'base',
        whisperOptions: expect.objectContaining({
          outputInJson: true,
        }),
      }));
    });

    it('should parse JSON output file when available', async () => {
      const jsonContent = {
        transcription: [
          {
            timestamps: { from: '00:00:00.000', to: '00:00:02.500' },
            speech: 'Hello world',
          },
          {
            timestamps: { from: '00:00:02.500', to: '00:00:05.000' },
            speech: 'This is a test',
          },
        ],
        params: { language: 'en' },
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(jsonContent));
      (fs.unlinkSync as jest.Mock).mockReturnValue(undefined);
      (nodewhisper as jest.Mock).mockResolvedValue('raw output');

      const result = await service.transcribe('/test.webm');

      expect(result.language).toBe('en');
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].text).toBe('Hello world');
      expect(result.segments[0].start).toBe(0);
      expect(result.segments[0].end).toBe(2.5);
      expect(result.segments[1].text).toBe('This is a test');
      expect(result.text).toBe('Hello world This is a test');
    });
  });
});
