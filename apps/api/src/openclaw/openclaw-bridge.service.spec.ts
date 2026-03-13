import { Test, TestingModule } from '@nestjs/testing';
import { OpenclawBridgeService, ChatMessageCreatedEvent } from './openclaw-bridge.service';
import { OpenclawGatewayService } from './openclaw-gateway.service';
import { OpenclawAgentService } from './openclaw-agent.service';
import { ChatService } from '../chat/chat.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OpenclawBridgeService', () => {
  let service: OpenclawBridgeService;
  let gateway: any;
  let agentService: any;
  let chatService: any;
  let prisma: any;

  const mockAgent = {
    id: 'agent-1',
    name: 'test-bot',
    displayName: 'Test Bot',
    userId: 'bot-user-1',
    openclawAgent: 'test-agent',
    isActive: true,
    systemPrompt: null,
    user: { id: 'bot-user-1', displayName: 'Test Bot' },
  };

  beforeEach(async () => {
    gateway = {
      isConnected: jest.fn().mockReturnValue(true),
      invokeAgent: jest.fn().mockResolvedValue('Agent response'),
    };

    agentService = {
      getAssignmentsForRoom: jest.fn().mockResolvedValue([]),
      getAssignmentsForWorkspace: jest.fn().mockResolvedValue([]),
    };

    chatService = {
      createMessage: jest.fn().mockResolvedValue({
        id: 'msg-1',
        content: 'Agent response',
        createdAt: new Date(),
        sender: { id: 'bot-user-1', displayName: 'Test Bot' },
      }),
    };

    prisma = {
      room: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenclawBridgeService,
        { provide: OpenclawGatewayService, useValue: gateway },
        { provide: OpenclawAgentService, useValue: agentService },
        { provide: ChatService, useValue: chatService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<OpenclawBridgeService>(OpenclawBridgeService);

    // Set up mock Socket.IO server
    const mockServer = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    service.setChatServer(mockServer);
  });

  describe('handleChatMessage', () => {
    const humanMessage: ChatMessageCreatedEvent = {
      id: 'msg-1',
      workspaceId: 'ws-1',
      roomId: 'room-1',
      senderId: 'human-user',
      senderName: 'Alice',
      content: 'Hello bot!',
      isBot: false,
    };

    it('should invoke agent when assigned to room', async () => {
      agentService.getAssignmentsForRoom.mockResolvedValue([
        { agent: mockAgent, mentionOnly: false },
      ]);

      await service.handleChatMessage(humanMessage);

      expect(gateway.invokeAgent).toHaveBeenCalledWith(
        'test-agent',
        'Alice: Hello bot!',
        'nestlyx:ws-1:room-1',
      );
      expect(chatService.createMessage).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        roomId: 'room-1',
        senderId: 'bot-user-1',
        content: 'Agent response',
      });
    });

    it('should NOT invoke agent for bot messages (loop prevention)', async () => {
      const botMessage: ChatMessageCreatedEvent = {
        ...humanMessage,
        isBot: true,
        senderId: 'bot-user-1',
      };

      await service.handleChatMessage(botMessage);

      expect(agentService.getAssignmentsForRoom).not.toHaveBeenCalled();
      expect(gateway.invokeAgent).not.toHaveBeenCalled();
    });

    it('should skip when mentionOnly and no mention', async () => {
      agentService.getAssignmentsForRoom.mockResolvedValue([
        { agent: mockAgent, mentionOnly: true },
      ]);

      await service.handleChatMessage(humanMessage);

      expect(gateway.invokeAgent).not.toHaveBeenCalled();
    });

    it('should invoke when mentionOnly and message contains mention', async () => {
      agentService.getAssignmentsForRoom.mockResolvedValue([
        { agent: mockAgent, mentionOnly: true },
      ]);

      await service.handleChatMessage({
        ...humanMessage,
        content: 'Hey @Test Bot what do you think?',
      });

      expect(gateway.invokeAgent).toHaveBeenCalled();
    });

    it('should not invoke when gateway is disconnected', async () => {
      gateway.isConnected.mockReturnValue(false);

      await service.handleChatMessage(humanMessage);

      expect(agentService.getAssignmentsForRoom).not.toHaveBeenCalled();
    });

    it('should not invoke when no agents assigned', async () => {
      agentService.getAssignmentsForRoom.mockResolvedValue([]);

      await service.handleChatMessage(humanMessage);

      expect(gateway.invokeAgent).not.toHaveBeenCalled();
    });

    it('should skip inactive agents', async () => {
      agentService.getAssignmentsForRoom.mockResolvedValue([
        { agent: { ...mockAgent, isActive: false }, mentionOnly: false },
      ]);

      await service.handleChatMessage(humanMessage);

      expect(gateway.invokeAgent).not.toHaveBeenCalled();
    });
  });

  describe('handleTranscriptionCompleted', () => {
    it('should forward transcription to assigned agents', async () => {
      prisma.room.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        name: 'Team Meeting',
      });
      agentService.getAssignmentsForRoom.mockResolvedValue([
        { agent: mockAgent, mentionOnly: false },
      ]);

      await service.handleTranscriptionCompleted({
        transcriptionId: 'tx-1',
        recordingId: 'rec-1',
        roomId: 'room-1',
        text: 'Alice: Hello everyone.\nBob: Hi Alice.',
      });

      expect(gateway.invokeAgent).toHaveBeenCalledWith(
        'test-agent',
        expect.stringContaining('Team Meeting'),
        'nestlyx:ws-1:room-1',
      );
    });
  });
});
