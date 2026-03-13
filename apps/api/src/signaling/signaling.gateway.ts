import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { SIGNALING_NAMESPACE, SIGNAL_EVENTS } from '@nestlyx/shared';
import { RoomsService } from '../rooms/rooms.service';
import { UsersService } from '../users/users.service';

interface AuthenticatedSocket extends Socket {
  data: { userId: string; displayName?: string };
}

interface RoomPeer {
  socketId: string;
  userId: string;
  displayName: string;
  isMuted: boolean;
}

@WebSocketGateway({ namespace: SIGNALING_NAMESPACE, cors: { origin: '*' } })
export class SignalingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(SignalingGateway.name);
  // In-memory peer tracking (for v1; Redis in production)
  private roomPeers = new Map<string, Map<string, RoomPeer>>();
  private socketToRoom = new Map<string, string>();

  constructor(
    private jwtService: JwtService,
    private roomsService: RoomsService,
    private usersService: UsersService,
  ) {}

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
      const user = await this.usersService.findById(payload.sub);
      client.data.displayName = user?.displayName || payload.email;
      this.logger.log(`Signaling client connected: ${payload.sub}`);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const roomId = this.socketToRoom.get(client.id);
    if (roomId) {
      this.removePeer(roomId, client);
    }
  }

  @SubscribeMessage(SIGNAL_EVENTS.JOIN_ROOM)
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    const { roomId } = data;
    const userId = client.data.userId;

    // Join Socket.IO room
    client.join(`signal:${roomId}`);
    this.socketToRoom.set(client.id, roomId);

    // Track peer
    if (!this.roomPeers.has(roomId)) {
      this.roomPeers.set(roomId, new Map());
    }
    const peers = this.roomPeers.get(roomId)!;
    peers.set(userId, {
      socketId: client.id,
      userId,
      displayName: client.data.displayName || userId,
      isMuted: false,
    });

    // Send existing peers to the new joiner
    const existingPeers = Array.from(peers.values())
      .filter((p) => p.userId !== userId)
      .map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        isMuted: p.isMuted,
      }));

    client.emit(SIGNAL_EVENTS.ROOM_PEERS, { roomId, peers: existingPeers });

    // Notify others
    client.to(`signal:${roomId}`).emit(SIGNAL_EVENTS.PEER_JOINED, {
      roomId,
      peer: { userId, displayName: client.data.displayName, isMuted: false },
    });

    // Join in DB
    try {
      await this.roomsService.join(roomId, userId);
    } catch {
      // Already joined or room not found — ignore for signaling
    }
  }

  @SubscribeMessage(SIGNAL_EVENTS.OFFER)
  handleOffer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; targetUserId: string; sdp: any },
  ) {
    const targetPeer = this.findPeerSocket(data.roomId, data.targetUserId);
    if (targetPeer) {
      this.server.to(targetPeer.socketId).emit(SIGNAL_EVENTS.OFFER, {
        roomId: data.roomId,
        fromUserId: client.data.userId,
        sdp: data.sdp,
      });
    }
  }

  @SubscribeMessage(SIGNAL_EVENTS.ANSWER)
  handleAnswer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; targetUserId: string; sdp: any },
  ) {
    const targetPeer = this.findPeerSocket(data.roomId, data.targetUserId);
    if (targetPeer) {
      this.server.to(targetPeer.socketId).emit(SIGNAL_EVENTS.ANSWER, {
        roomId: data.roomId,
        fromUserId: client.data.userId,
        sdp: data.sdp,
      });
    }
  }

  @SubscribeMessage(SIGNAL_EVENTS.ICE_CANDIDATE)
  handleIceCandidate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; targetUserId: string; candidate: any },
  ) {
    const targetPeer = this.findPeerSocket(data.roomId, data.targetUserId);
    if (targetPeer) {
      this.server.to(targetPeer.socketId).emit(SIGNAL_EVENTS.ICE_CANDIDATE, {
        roomId: data.roomId,
        fromUserId: client.data.userId,
        candidate: data.candidate,
      });
    }
  }

  @SubscribeMessage(SIGNAL_EVENTS.MUTE_TOGGLE)
  async handleMuteToggle(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; isMuted: boolean },
  ) {
    const peers = this.roomPeers.get(data.roomId);
    if (peers) {
      const peer = peers.get(client.data.userId);
      if (peer) peer.isMuted = data.isMuted;
    }

    client.to(`signal:${data.roomId}`).emit(SIGNAL_EVENTS.MUTE_TOGGLE, {
      roomId: data.roomId,
      userId: client.data.userId,
      isMuted: data.isMuted,
    });

    try {
      await this.roomsService.updateMuteState(data.roomId, client.data.userId, data.isMuted);
    } catch {
      // ignore
    }
  }

  @SubscribeMessage(SIGNAL_EVENTS.LEAVE_ROOM)
  handleLeaveRoom(@ConnectedSocket() client: AuthenticatedSocket) {
    const roomId = this.socketToRoom.get(client.id);
    if (roomId) {
      this.removePeer(roomId, client);
    }
  }

  private removePeer(roomId: string, client: AuthenticatedSocket) {
    const userId = client.data.userId;
    const peers = this.roomPeers.get(roomId);
    if (peers) {
      peers.delete(userId);
      if (peers.size === 0) this.roomPeers.delete(roomId);
    }
    this.socketToRoom.delete(client.id);
    client.leave(`signal:${roomId}`);

    this.server.to(`signal:${roomId}`).emit(SIGNAL_EVENTS.PEER_LEFT, {
      roomId,
      userId,
    });

    this.roomsService.leave(roomId, userId).catch(() => {});
  }

  private findPeerSocket(roomId: string, userId: string): RoomPeer | undefined {
    return this.roomPeers.get(roomId)?.get(userId);
  }
}
