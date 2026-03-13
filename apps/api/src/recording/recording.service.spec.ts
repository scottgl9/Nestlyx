import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RecordingService } from './recording.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage/storage.service';

describe('RecordingService', () => {
  let service: RecordingService;
  let prisma: any;
  let storage: any;

  beforeEach(async () => {
    prisma = {
      recording: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    storage = {
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecordingService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    service = module.get<RecordingService>(RecordingService);
  });

  describe('startRecording', () => {
    it('should create a recording entry', async () => {
      prisma.recording.create.mockResolvedValue({
        id: 'rec1',
        roomId: 'room1',
        userId: 'user1',
        status: 'RECORDING',
      });

      const result = await service.startRecording('room1', 'user1');
      expect(result.status).toBe('RECORDING');
    });
  });

  describe('stopRecording', () => {
    it('should update status to STOPPED', async () => {
      prisma.recording.findUnique.mockResolvedValue({ id: 'rec1' });
      prisma.recording.update.mockResolvedValue({
        id: 'rec1',
        status: 'STOPPED',
      });

      const result = await service.stopRecording('rec1');
      expect(result.status).toBe('STOPPED');
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.recording.findUnique.mockResolvedValue(null);

      await expect(service.stopRecording('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('uploadRecording', () => {
    it('should save file and update recording', async () => {
      prisma.recording.findUnique.mockResolvedValue({
        id: 'rec1',
        roomId: 'room1',
      });
      storage.save.mockResolvedValue('/uploads/recordings/room1/rec1.webm');
      prisma.recording.update.mockResolvedValue({
        id: 'rec1',
        status: 'COMPLETED',
        filePath: '/uploads/recordings/room1/rec1.webm',
        fileSize: 1024,
      });

      const file = { buffer: Buffer.from('test'), size: 1024 } as any;
      const result = await service.uploadRecording('rec1', file);
      expect(result.status).toBe('COMPLETED');
    });
  });
});
