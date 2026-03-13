import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  async create(workspaceId: string, name: string, userId: string) {
    const room = await this.prisma.room.create({
      data: { workspaceId, name },
    });

    await this.logEvent(room.id, 'ROOM_CREATED', userId);
    return room;
  }

  async findByWorkspace(workspaceId: string) {
    return this.prisma.room.findMany({
      where: { workspaceId },
      include: {
        _count: { select: { participants: { where: { leftAt: null } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: {
        participants: {
          where: { leftAt: null },
          include: { user: { select: { id: true, displayName: true, email: true } } },
        },
      },
    });
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  async findByInviteCode(inviteCode: string) {
    const room = await this.prisma.room.findUnique({ where: { inviteCode } });
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  async join(roomId: string, userId: string, role = 'GUEST') {
    // Reactivate if previously left, else create
    const existing = await this.prisma.participant.findFirst({
      where: { roomId, userId, leftAt: { not: null } },
    });

    let participant;
    if (existing) {
      participant = await this.prisma.participant.update({
        where: { id: existing.id },
        data: { leftAt: null, isMuted: false, joinedAt: new Date() },
      });
    } else {
      participant = await this.prisma.participant.create({
        data: { roomId, userId, role },
      });
    }

    // Activate room if idle
    await this.prisma.room.update({
      where: { id: roomId },
      data: { status: 'ACTIVE' },
    });

    await this.logEvent(roomId, 'PARTICIPANT_JOINED', userId);
    return participant;
  }

  async leave(roomId: string, userId: string) {
    const participant = await this.prisma.participant.findFirst({
      where: { roomId, userId, leftAt: null },
    });
    if (!participant) throw new NotFoundException('Not in room');

    await this.prisma.participant.update({
      where: { id: participant.id },
      data: { leftAt: new Date() },
    });

    await this.logEvent(roomId, 'PARTICIPANT_LEFT', userId);

    // If no active participants, end room
    const activeCount = await this.prisma.participant.count({
      where: { roomId, leftAt: null },
    });
    if (activeCount === 0) {
      await this.prisma.room.update({
        where: { id: roomId },
        data: { status: 'ENDED' },
      });
      await this.logEvent(roomId, 'ROOM_ENDED', userId);
    }
  }

  async updateMuteState(roomId: string, userId: string, isMuted: boolean) {
    const participant = await this.prisma.participant.findFirst({
      where: { roomId, userId, leftAt: null },
    });
    if (!participant) throw new NotFoundException('Not in room');

    await this.prisma.participant.update({
      where: { id: participant.id },
      data: { isMuted },
    });

    const eventType = isMuted ? 'PARTICIPANT_MUTED' : 'PARTICIPANT_UNMUTED';
    await this.logEvent(roomId, eventType, userId);
  }

  private async logEvent(roomId: string, type: string, actorId: string | null, metadata = {}) {
    await this.prisma.meetingEvent.create({
      data: { roomId, type, actorId, metadata },
    });
  }
}
