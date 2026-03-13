import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import { OpenclawGatewayService } from './openclaw-gateway.service';
import { OpenclawAgentService } from './openclaw-agent.service';
import { CHAT_EVENTS, AGENT_EVENTS } from '@nestlyx/shared';

export interface ChatMessageCreatedEvent {
  id: string;
  workspaceId: string;
  roomId: string | null;
  senderId: string;
  senderName: string;
  content: string;
  isBot: boolean;
}

export interface TranscriptionCompletedEvent {
  transcriptionId: string;
  recordingId: string;
  roomId: string;
  text: string;
}

@Injectable()
export class OpenclawBridgeService {
  private readonly logger = new Logger(OpenclawBridgeService.name);
  private chatGatewayServer: any = null;

  constructor(
    private prisma: PrismaService,
    private chatService: ChatService,
    private gateway: OpenclawGatewayService,
    private agentService: OpenclawAgentService,
  ) {}

  @OnEvent('chat.server.init')
  handleChatServerInit(server: any) {
    this.chatGatewayServer = server;
    this.logger.log('Chat server reference acquired');
  }

  /** Called by ChatGateway to provide access to the Socket.IO server instance */
  setChatServer(server: any) {
    this.chatGatewayServer = server;
  }

  @OnEvent('chat.message.created')
  async handleChatMessage(event: ChatMessageCreatedEvent) {
    // Prevent infinite loops: ignore bot messages
    if (event.isBot) return;

    if (!this.gateway.isConnected()) return;

    try {
      // Determine which room/workspace to check
      const workspaceId = event.workspaceId;
      const roomId = event.roomId;

      let assignments: Awaited<ReturnType<typeof this.agentService.getAssignmentsForRoom>>;
      if (roomId) {
        assignments = await this.agentService.getAssignmentsForRoom(workspaceId, roomId);
      } else {
        assignments = await this.agentService.getAssignmentsForWorkspace(workspaceId);
      }

      for (const assignment of assignments) {
        if (!assignment.agent.isActive) continue;

        // Check mention-only filter
        if (assignment.mentionOnly) {
          const mentionTag = `@${assignment.agent.displayName}`;
          if (!event.content.includes(mentionTag)) continue;
        }

        // Emit typing indicator
        this.emitTypingIndicator(event.workspaceId, event.roomId, assignment.agent.userId);

        // Invoke agent
        const sessionKey = `nestlyx:${workspaceId}:${roomId || 'workspace'}`;
        const prompt = assignment.agent.systemPrompt
          ? `${assignment.agent.systemPrompt}\n\nUser (${event.senderName}): ${event.content}`
          : `${event.senderName}: ${event.content}`;

        try {
          const response = await this.gateway.invokeAgent(
            assignment.agent.openclawAgent,
            prompt,
            sessionKey,
          );

          if (response) {
            await this.sendAgentResponse(
              assignment.agent.userId,
              assignment.agent.displayName,
              workspaceId,
              roomId,
              response,
            );
          }
        } catch (err: any) {
          this.logger.error(
            `Agent "${assignment.agent.name}" failed to respond: ${err.message}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(`Bridge error handling chat message: ${err.message}`);
    }
  }

  @OnEvent('transcription.completed')
  async handleTranscriptionCompleted(event: TranscriptionCompletedEvent) {
    if (!this.gateway.isConnected()) return;

    try {
      // Look up the room's workspace
      const room = await this.prisma.room.findUnique({
        where: { id: event.roomId },
        select: { workspaceId: true, name: true },
      });
      if (!room) return;

      const assignments = await this.agentService.getAssignmentsForRoom(
        room.workspaceId,
        event.roomId,
      );

      for (const assignment of assignments) {
        if (!assignment.agent.isActive) continue;

        const sessionKey = `nestlyx:${room.workspaceId}:${event.roomId}`;
        const prompt = assignment.agent.systemPrompt
          ? `${assignment.agent.systemPrompt}\n\nThe following is a transcript of a meeting in room "${room.name}". Please review and respond if relevant:\n\n${event.text}`
          : `The following is a transcript of a meeting in room "${room.name}". Please review and respond if relevant:\n\n${event.text}`;

        try {
          const response = await this.gateway.invokeAgent(
            assignment.agent.openclawAgent,
            prompt,
            sessionKey,
          );

          if (response) {
            await this.sendAgentResponse(
              assignment.agent.userId,
              assignment.agent.displayName,
              room.workspaceId,
              event.roomId,
              response,
            );
          }
        } catch (err: any) {
          this.logger.error(
            `Agent "${assignment.agent.name}" failed on transcription: ${err.message}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(`Bridge error handling transcription: ${err.message}`);
    }
  }

  private async sendAgentResponse(
    agentUserId: string,
    agentDisplayName: string,
    workspaceId: string,
    roomId: string | null,
    content: string,
  ) {
    const message = await this.chatService.createMessage({
      workspaceId,
      roomId: roomId || undefined,
      senderId: agentUserId,
      content,
    });

    // Broadcast via Socket.IO if server is available
    if (this.chatGatewayServer) {
      const socketRoom = roomId ? `room:${roomId}` : `workspace:${workspaceId}`;
      this.chatGatewayServer.to(socketRoom).emit(CHAT_EVENTS.MESSAGE, {
        id: message.id,
        workspaceId,
        roomId: roomId || null,
        senderId: agentUserId,
        senderName: agentDisplayName,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        isBot: true,
      });
    }
  }

  private emitTypingIndicator(
    workspaceId: string,
    roomId: string | null,
    agentUserId: string,
  ) {
    if (!this.chatGatewayServer) return;
    const socketRoom = roomId ? `room:${roomId}` : `workspace:${workspaceId}`;
    this.chatGatewayServer.to(socketRoom).emit(AGENT_EVENTS.TYPING, {
      userId: agentUserId,
    });
  }
}
