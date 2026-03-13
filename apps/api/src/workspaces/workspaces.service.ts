import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkspacesService {
  constructor(private prisma: PrismaService) {}

  async create(name: string, ownerId: string) {
    const slug = this.generateSlug(name);
    return this.prisma.workspace.create({
      data: {
        name,
        slug,
        ownerId,
        members: {
          create: { userId: ownerId, role: 'OWNER' },
        },
      },
      include: { members: true },
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: { members: { some: { userId } } },
      include: { _count: { select: { members: true, rooms: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
      include: {
        members: { include: { user: { select: { id: true, email: true, displayName: true } } } },
        _count: { select: { rooms: true } },
      },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }

  async assertMembership(workspaceId: string, userId: string) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a workspace member');
    return member;
  }

  async addMember(workspaceId: string, email: string, role: string, actorId: string) {
    await this.assertAdminOrOwner(workspaceId, actorId);

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
      update: { role },
      create: { workspaceId, userId: user.id, role },
    });
  }

  private async assertAdminOrOwner(workspaceId: string, userId: string) {
    const member = await this.assertMembership(workspaceId, userId);
    if (member.role !== 'OWNER' && member.role !== 'ADMIN') {
      throw new ForbiddenException('Insufficient permissions');
    }
    return member;
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const suffix = Math.random().toString(36).substring(2, 8);
    return `${base}-${suffix}`;
  }
}
