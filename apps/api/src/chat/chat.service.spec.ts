import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ChatService', () => {
  let service: ChatService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      chatMessage: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('createMessage', () => {
    it('should create and return a message', async () => {
      const mockMessage = {
        id: '1',
        workspaceId: 'ws1',
        roomId: null,
        senderId: 'user1',
        content: 'Hello',
        createdAt: new Date(),
        sender: { id: 'user1', displayName: 'Test' },
      };
      prisma.chatMessage.create.mockResolvedValue(mockMessage);

      const result = await service.createMessage({
        workspaceId: 'ws1',
        senderId: 'user1',
        content: 'Hello',
      });

      expect(result).toEqual(mockMessage);
      expect(prisma.chatMessage.create).toHaveBeenCalled();
    });

    it('should create room-scoped message', async () => {
      prisma.chatMessage.create.mockResolvedValue({
        id: '2',
        workspaceId: 'ws1',
        roomId: 'room1',
        senderId: 'user1',
        content: 'Hello room',
        createdAt: new Date(),
        sender: { id: 'user1', displayName: 'Test' },
      });

      const result = await service.createMessage({
        workspaceId: 'ws1',
        roomId: 'room1',
        senderId: 'user1',
        content: 'Hello room',
      });

      expect(result.roomId).toBe('room1');
    });
  });

  describe('getHistory', () => {
    it('should return paginated messages', async () => {
      const messages = Array.from({ length: 5 }, (_, i) => ({
        id: `msg-${i}`,
        content: `Message ${i}`,
        createdAt: new Date(),
        sender: { id: 'user1', displayName: 'Test' },
      }));
      prisma.chatMessage.findMany.mockResolvedValue(messages);

      const result = await service.getHistory({
        workspaceId: 'ws1',
        limit: 50,
      });

      expect(result.messages).toHaveLength(5);
      expect(result.hasMore).toBe(false);
    });
  });
});
