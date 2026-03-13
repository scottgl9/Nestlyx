import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { PrismaService } from '../prisma/prisma.service';

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      workspace: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      workspaceMember: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<WorkspacesService>(WorkspacesService);
  });

  describe('create', () => {
    it('should create a workspace with owner as member', async () => {
      const mockWorkspace = {
        id: '1',
        name: 'Test Workspace',
        slug: 'test-workspace-abc123',
        ownerId: 'user1',
        members: [{ userId: 'user1', role: 'OWNER' }],
      };
      prisma.workspace.create.mockResolvedValue(mockWorkspace);

      const result = await service.create('Test Workspace', 'user1');
      expect(result.ownerId).toBe('user1');
      expect(prisma.workspace.create).toHaveBeenCalled();
    });
  });

  describe('assertMembership', () => {
    it('should return member if exists', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue({
        workspaceId: 'ws1',
        userId: 'user1',
        role: 'MEMBER',
      });

      const result = await service.assertMembership('ws1', 'user1');
      expect(result.role).toBe('MEMBER');
    });

    it('should throw ForbiddenException if not member', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(null);

      await expect(
        service.assertMembership('ws1', 'user1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException if not found', async () => {
      prisma.workspace.findUnique.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
