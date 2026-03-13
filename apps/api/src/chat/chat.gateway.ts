import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, Inject, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { CHAT_NAMESPACE, CHAT_EVENTS, MAX_CHAT_MESSAGE_LENGTH } from '@nestlyx/shared';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';

interface AuthenticatedSocket extends Socket {
  data: { userId: string; email: string };
}

@WebSocketGateway({ namespace: CHAT_NAMESPACE, cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private chatService: ChatService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    @Optional() private eventEmitter?: EventEmitter2,
  ) {}

  afterInit(server: Server) {
    // Make server available to bridge service via event
    this.eventEmitter?.emit('chat.server.init', server);
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = this.jwtService.verify(token);
      client.data.userId = payload.sub;
      client.data.email = payload.email;
      this.logger.log(`Chat client connected: ${payload.sub}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Chat client disconnected: ${client.data?.userId}`);
  }

  @SubscribeMessage(CHAT_EVENTS.SEND)
  async handleSend(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { workspaceId: string; roomId?: string; content: string },
  ) {
    if (!data.content || data.content.length > MAX_CHAT_MESSAGE_LENGTH) return;

    const message = await this.chatService.createMessage({
      workspaceId: data.workspaceId,
      roomId: data.roomId,
      senderId: client.data.userId,
      content: data.content,
    });

    const room = data.roomId
      ? `room:${data.roomId}`
      : `workspace:${data.workspaceId}`;

    // Check if sender is a bot
    const sender = await this.prisma.user.findUnique({
      where: { id: client.data.userId },
      select: { isBot: true },
    });
    const isBot = sender?.isBot ?? false;

    const payload = {
      id: message.id,
      workspaceId: data.workspaceId,
      roomId: data.roomId || null,
      senderId: message.senderId,
      senderName: message.sender.displayName,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      isBot,
    };

    this.server.to(room).emit(CHAT_EVENTS.MESSAGE, payload);

    // Emit internal event for bridge service
    this.eventEmitter?.emit('chat.message.created', payload);
  }

  @SubscribeMessage(CHAT_EVENTS.HISTORY)
  async handleHistory(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { workspaceId: string; roomId?: string; cursor?: string; limit?: number },
  ) {
    const result = await this.chatService.getHistory(data);
    client.emit(CHAT_EVENTS.HISTORY_RESPONSE, result);
  }

  @SubscribeMessage('join')
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { workspaceId?: string; roomId?: string },
  ) {
    if (data.roomId) client.join(`room:${data.roomId}`);
    if (data.workspaceId) client.join(`workspace:${data.workspaceId}`);
  }
}
