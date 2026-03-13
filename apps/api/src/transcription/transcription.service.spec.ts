import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TranscriptionService } from './transcription.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhisperService } from './whisper.service';

describe('TranscriptionService', () => {
  let service: TranscriptionService;
  let prisma: any;
  let whisper: any;

  beforeEach(async () => {
    prisma = {
      recording: {
        findUnique: jest.fn(),
      },
      transcription: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    whisper = {
      getModelName: jest.fn().mockReturnValue('base'),
      transcribe: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranscriptionService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhisperService, useValue: whisper },
      ],
    }).compile();

    service = module.get<TranscriptionService>(TranscriptionService);
  });

  describe('transcribeRecording', () => {
    it('should create a transcription entry and start processing (mixed audio)', async () => {
      prisma.recording.findUnique.mockResolvedValue({
        id: 'rec1',
        filePath: '/uploads/test.webm',
        speakerTracks: [],
      });
      prisma.transcription.create.mockResolvedValue({
        id: 'trans1',
        recordingId: 'rec1',
        status: 'PROCESSING',
        model: 'base',
      });
      whisper.transcribe.mockResolvedValue({
        text: 'Hello world',
        segments: [],
        language: 'en',
      });
      prisma.transcription.update.mockResolvedValue({});

      const result = await service.transcribeRecording('rec1');

      expect(result.status).toBe('PROCESSING');
      expect(prisma.transcription.create).toHaveBeenCalledWith({
        data: {
          recordingId: 'rec1',
          status: 'PROCESSING',
          model: 'base',
        },
      });
    });

    it('should use speaker tracks when available', async () => {
      prisma.recording.findUnique.mockResolvedValue({
        id: 'rec1',
        filePath: '/uploads/mixed.webm',
        speakerTracks: [
          { userId: 'user1', speakerName: 'Alice', filePath: '/uploads/speaker-user1.webm' },
          { userId: 'user2', speakerName: 'Bob', filePath: '/uploads/speaker-user2.webm' },
        ],
      });
      prisma.transcription.create.mockResolvedValue({
        id: 'trans1',
        recordingId: 'rec1',
        status: 'PROCESSING',
        model: 'base',
      });
      whisper.transcribe
        .mockResolvedValueOnce({
          text: 'Hello from Alice',
          segments: [{ start: 0, end: 2, text: 'Hello from Alice' }],
          language: 'en',
        })
        .mockResolvedValueOnce({
          text: 'Hello from Bob',
          segments: [{ start: 1, end: 3, text: 'Hello from Bob' }],
          language: 'en',
        });
      prisma.transcription.update.mockResolvedValue({});

      const result = await service.transcribeRecording('rec1');
      expect(result.status).toBe('PROCESSING');
    });

    it('should throw NotFoundException if recording not found', async () => {
      prisma.recording.findUnique.mockResolvedValue(null);

      await expect(service.transcribeRecording('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if recording has no file and no speaker tracks', async () => {
      prisma.recording.findUnique.mockResolvedValue({
        id: 'rec1',
        filePath: null,
        speakerTracks: [],
      });

      await expect(service.transcribeRecording('rec1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getTranscription', () => {
    it('should return transcription by id', async () => {
      prisma.transcription.findUnique.mockResolvedValue({
        id: 'trans1',
        text: 'Hello',
        status: 'COMPLETED',
      });

      const result = await service.getTranscription('trans1');
      expect(result.text).toBe('Hello');
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.transcription.findUnique.mockResolvedValue(null);

      await expect(service.getTranscription('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listByRecording', () => {
    it('should return transcriptions for a recording', async () => {
      prisma.transcription.findMany.mockResolvedValue([
        { id: 'trans1', status: 'COMPLETED' },
      ]);

      const result = await service.listByRecording('rec1');
      expect(result).toHaveLength(1);
    });
  });
});
