import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAgentDto, AssignAgentDto } from '@nestlyx/shared';
import * as bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';

@Injectable()
export class OpenclawAgentService {
  private readonly logger = new Logger(OpenclawAgentService.name);

  constructor(private prisma: PrismaService) {}

  async createAgent(dto: CreateAgentDto) {
    // Check for duplicate name
    const existing = await this.prisma.agentConfig.findUnique({
      where: { name: dto.name },
    });
    if (existing) throw new ConflictException(`Agent "${dto.name}" already exists`);

    // Create bot user with random credentials
    const email = `agent-${dto.name}@bot.nestlyx.local`;
    const passwordHash = await bcrypt.hash(uuid(), 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        displayName: dto.displayName,
        passwordHash,
        isBot: true,
      },
    });

    const agentConfig = await this.prisma.agentConfig.create({
      data: {
        name: dto.name,
        displayName: dto.displayName,
        userId: user.id,
        openclawAgent: dto.openclawAgent,
        voiceEnabled: dto.voiceEnabled ?? false,
        ttsVoiceId: dto.ttsVoiceId,
        systemPrompt: dto.systemPrompt,
      },
    });

    this.logger.log(`Created agent "${dto.name}" with user ${user.id}`);
    return agentConfig;
  }

  async deleteAgent(id: string) {
    const agent = await this.prisma.agentConfig.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException('Agent not found');

    await this.prisma.agentConfig.delete({ where: { id } });
    await this.prisma.user.delete({ where: { id: agent.userId } });

    this.logger.log(`Deleted agent "${agent.name}"`);
  }

  async listAgents() {
    return this.prisma.agentConfig.findMany({
      include: { assignments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAgent(id: string) {
    const agent = await this.prisma.agentConfig.findUnique({
      where: { id },
      include: { assignments: true },
    });
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  async assignToWorkspace(agentId: string, dto: AssignAgentDto) {
    const agent = await this.prisma.agentConfig.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agent not found');

    // Create assignment
    const assignment = await this.prisma.agentAssignment.create({
      data: {
        agentId,
        workspaceId: dto.workspaceId,
        roomId: dto.roomId || null,
        mentionOnly: dto.mentionOnly ?? false,
      },
    });

    // Ensure bot user is a workspace member
    await this.prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: dto.workspaceId,
          userId: agent.userId,
        },
      },
      create: {
        workspaceId: dto.workspaceId,
        userId: agent.userId,
        role: 'MEMBER',
      },
      update: {},
    });

    this.logger.log(
      `Assigned agent "${agent.name}" to workspace ${dto.workspaceId}` +
        (dto.roomId ? ` room ${dto.roomId}` : ' (all rooms)'),
    );

    return assignment;
  }

  async removeAssignment(agentId: string, workspaceId: string, roomId?: string) {
    // Find the assignment first since compound unique with nullable roomId is complex
    const assignment = await this.prisma.agentAssignment.findFirst({
      where: {
        agentId,
        workspaceId,
        roomId: roomId || null,
      },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    await this.prisma.agentAssignment.delete({ where: { id: assignment.id } });
  }

  async getAssignmentsForRoom(workspaceId: string, roomId: string) {
    return this.prisma.agentAssignment.findMany({
      where: {
        workspaceId,
        OR: [
          { roomId },        // assigned to this specific room
          { roomId: null },  // assigned to all rooms in workspace
        ],
      },
      include: {
        agent: {
          include: { user: { select: { id: true, displayName: true } } },
        },
      },
    });
  }

  async getAssignmentsForWorkspace(workspaceId: string) {
    return this.prisma.agentAssignment.findMany({
      where: { workspaceId, roomId: null },
      include: {
        agent: {
          include: { user: { select: { id: true, displayName: true } } },
        },
      },
    });
  }
}
