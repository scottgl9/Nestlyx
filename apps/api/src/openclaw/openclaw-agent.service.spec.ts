import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { OpenclawAgentService } from './openclaw-agent.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OpenclawAgentService', () => {
  let service: OpenclawAgentService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      agentConfig: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      agentAssignment: {
        create: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        create: jest.fn(),
        delete: jest.fn(),
      },
      workspaceMember: {
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenclawAgentService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<OpenclawAgentService>(OpenclawAgentService);
  });

  describe('createAgent', () => {
    it('should create a bot user and agent config', async () => {
      prisma.agentConfig.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'agent-test@bot.nestlyx.local',
        displayName: 'Test Agent',
        isBot: true,
      });
      prisma.agentConfig.create.mockResolvedValue({
        id: 'agent-1',
        name: 'test',
        displayName: 'Test Agent',
        userId: 'user-1',
        openclawAgent: 'test-agent',
      });

      const result = await service.createAgent({
        name: 'test',
        displayName: 'Test Agent',
        openclawAgent: 'test-agent',
      });

      expect(result.name).toBe('test');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isBot: true }),
        }),
      );
    });

    it('should throw ConflictException for duplicate name', async () => {
      prisma.agentConfig.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createAgent({
          name: 'test',
          displayName: 'Test',
          openclawAgent: 'test',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteAgent', () => {
    it('should delete agent config and user', async () => {
      prisma.agentConfig.findUnique.mockResolvedValue({
        id: 'agent-1',
        userId: 'user-1',
        name: 'test',
      });
      prisma.agentConfig.delete.mockResolvedValue({});
      prisma.user.delete.mockResolvedValue({});

      await service.deleteAgent('agent-1');

      expect(prisma.agentConfig.delete).toHaveBeenCalledWith({
        where: { id: 'agent-1' },
      });
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });

    it('should throw NotFoundException if agent does not exist', async () => {
      prisma.agentConfig.findUnique.mockResolvedValue(null);

      await expect(service.deleteAgent('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listAgents', () => {
    it('should return all agents with assignments', async () => {
      const agents = [
        { id: 'a1', name: 'bot1', assignments: [] },
        { id: 'a2', name: 'bot2', assignments: [] },
      ];
      prisma.agentConfig.findMany.mockResolvedValue(agents);

      const result = await service.listAgents();

      expect(result).toHaveLength(2);
    });
  });

  describe('assignToWorkspace', () => {
    it('should create assignment and workspace membership', async () => {
      prisma.agentConfig.findUnique.mockResolvedValue({
        id: 'agent-1',
        userId: 'user-1',
      });
      prisma.agentAssignment.create.mockResolvedValue({
        id: 'assign-1',
        agentId: 'agent-1',
        workspaceId: 'ws-1',
        roomId: null,
      });
      prisma.workspaceMember.upsert.mockResolvedValue({});

      const result = await service.assignToWorkspace('agent-1', {
        workspaceId: 'ws-1',
      });

      expect(result.workspaceId).toBe('ws-1');
      expect(prisma.workspaceMember.upsert).toHaveBeenCalled();
    });

    it('should assign to specific room', async () => {
      prisma.agentConfig.findUnique.mockResolvedValue({
        id: 'agent-1',
        userId: 'user-1',
      });
      prisma.agentAssignment.create.mockResolvedValue({
        id: 'assign-1',
        agentId: 'agent-1',
        workspaceId: 'ws-1',
        roomId: 'room-1',
      });
      prisma.workspaceMember.upsert.mockResolvedValue({});

      const result = await service.assignToWorkspace('agent-1', {
        workspaceId: 'ws-1',
        roomId: 'room-1',
      });

      expect(result.roomId).toBe('room-1');
    });

    it('should throw NotFoundException if agent not found', async () => {
      prisma.agentConfig.findUnique.mockResolvedValue(null);

      await expect(
        service.assignToWorkspace('missing', { workspaceId: 'ws-1' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAssignmentsForRoom', () => {
    it('should return agents assigned to room or workspace-wide', async () => {
      prisma.agentAssignment.findMany.mockResolvedValue([
        { agentId: 'a1', roomId: 'room-1', agent: { name: 'bot1', isActive: true } },
        { agentId: 'a2', roomId: null, agent: { name: 'bot2', isActive: true } },
      ]);

      const result = await service.getAssignmentsForRoom('ws-1', 'room-1');

      expect(result).toHaveLength(2);
    });
  });
});
