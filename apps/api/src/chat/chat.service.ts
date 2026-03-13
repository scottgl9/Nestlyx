import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_CHAT_PAGE_SIZE } from '@nestlyx/shared';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async createMessage(data: {
    workspaceId: string;
    roomId?: string;
    senderId: string;
    content: string;
  }) {
    return this.prisma.chatMessage.create({
      data: {
        workspaceId: data.workspaceId,
        roomId: data.roomId || null,
        senderId: data.senderId,
        content: data.content,
      },
      include: {
        sender: { select: { id: true, displayName: true } },
      },
    });
  }

  async getHistory(params: {
    workspaceId: string;
    roomId?: string;
    cursor?: string;
    limit?: number;
  }) {
    const limit = params.limit || DEFAULT_CHAT_PAGE_SIZE;
    const where: any = { workspaceId: params.workspaceId };
    if (params.roomId) {
      where.roomId = params.roomId;
    } else {
      where.roomId = null;
    }

    const messages = await this.prisma.chatMessage.findMany({
      where,
      include: {
        sender: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(params.cursor
        ? { cursor: { id: params.cursor }, skip: 1 }
        : {}),
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    return {
      messages: messages.reverse(),
      hasMore,
      nextCursor: hasMore ? messages[0]?.id : null,
    };
  }
}
