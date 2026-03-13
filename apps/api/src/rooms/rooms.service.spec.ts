import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RoomsService', () => {
  let service: RoomsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      room: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      participant: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      meetingEvent: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<RoomsService>(RoomsService);
  });

  describe('create', () => {
    it('should create a room and log event', async () => {
      prisma.room.create.mockResolvedValue({
        id: 'room1',
        workspaceId: 'ws1',
        name: 'Test Room',
        status: 'IDLE',
      });
      prisma.meetingEvent.create.mockResolvedValue({});

      const result = await service.create('ws1', 'Test Room', 'user1');
      expect(result.name).toBe('Test Room');
      expect(prisma.meetingEvent.create).toHaveBeenCalled();
    });
  });

  describe('join', () => {
    it('should create participant and activate room', async () => {
      prisma.participant.findFirst.mockResolvedValue(null);
      prisma.participant.create.mockResolvedValue({
        id: 'p1',
        roomId: 'room1',
        userId: 'user1',
        role: 'GUEST',
      });
      prisma.room.update.mockResolvedValue({});
      prisma.meetingEvent.create.mockResolvedValue({});

      const result = await service.join('room1', 'user1');
      expect(result.userId).toBe('user1');
    });
  });

  describe('leave', () => {
    it('should mark participant as left', async () => {
      prisma.participant.findFirst.mockResolvedValue({
        id: 'p1',
        roomId: 'room1',
        userId: 'user1',
      });
      prisma.participant.update.mockResolvedValue({});
      prisma.participant.count.mockResolvedValue(0);
      prisma.room.update.mockResolvedValue({});
      prisma.meetingEvent.create.mockResolvedValue({});

      await service.leave('room1', 'user1');
      expect(prisma.participant.update).toHaveBeenCalled();
    });

    it('should throw if not in room', async () => {
      prisma.participant.findFirst.mockResolvedValue(null);

      await expect(service.leave('room1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException if not found', async () => {
      prisma.room.findUnique.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
