import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { SignalingGateway } from './signaling.gateway';
import { RoomsService } from '../rooms/rooms.service';
import { UsersService } from '../users/users.service';
import { SIGNAL_EVENTS } from '@nestlyx/shared';

function createMockSocket(overrides: Partial<{ id: string; userId: string; displayName: string }> = {}) {
  const id = overrides.id ?? 'socket-1';
  const userId = overrides.userId ?? 'user-1';
  const displayName = overrides.displayName ?? 'Alice';
  return {
    id,
    data: { userId, displayName },
    handshake: { auth: { token: 'valid-token' }, headers: {} },
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
    disconnect: jest.fn(),
  };
}

describe('SignalingGateway', () => {
  let gateway: SignalingGateway;
  let mockServer: { to: jest.Mock };

  const mockJwtService = {
    verify: jest.fn().mockReturnValue({ sub: 'user-1', email: 'alice@test.com' }),
  };

  const mockRoomsService = {
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    updateMuteState: jest.fn().mockResolvedValue(undefined),
  };

  const mockUsersService = {
    findById: jest.fn().mockResolvedValue({ id: 'user-1', displayName: 'Alice' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignalingGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: RoomsService, useValue: mockRoomsService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    gateway = module.get<SignalingGateway>(SignalingGateway);

    mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
    (gateway as any).server = mockServer;

    jest.clearAllMocks();
  });

  // Helper: join a peer to a room through the gateway
  async function joinPeer(
    socket: ReturnType<typeof createMockSocket>,
    roomId: string,
  ) {
    // Re-stub `to` so each call produces a fresh emit spy
    socket.to.mockReturnValue({ emit: jest.fn() });
    await gateway.handleJoinRoom(socket as any, { roomId });
  }

  // ---------------------------------------------------------------
  // 1. handleMediaState broadcasts to room peers
  // ---------------------------------------------------------------
  describe('handleMediaState', () => {
    it('should broadcast media state to room peers', async () => {
      const client = createMockSocket();
      const broadcastEmit = jest.fn();
      client.to.mockReturnValue({ emit: broadcastEmit });

      await joinPeer(client, 'room-1');
      broadcastEmit.mockClear();
      client.to.mockReturnValue({ emit: broadcastEmit });

      gateway.handleMediaState(client as any, {
        roomId: 'room-1',
        isCameraOn: true,
        isScreenSharing: false,
      });

      expect(client.to).toHaveBeenCalledWith('signal:room-1');
      expect(broadcastEmit).toHaveBeenCalledWith(SIGNAL_EVENTS.MEDIA_STATE, {
        roomId: 'room-1',
        userId: 'user-1',
        isCameraOn: true,
        isScreenSharing: false,
      });
    });

    it('should update stored peer camera state', async () => {
      const client = createMockSocket();
      await joinPeer(client, 'room-1');

      gateway.handleMediaState(client as any, {
        roomId: 'room-1',
        isCameraOn: true,
        isScreenSharing: false,
      });

      const peers = (gateway as any).roomPeers.get('room-1');
      expect(peers.get('user-1').isCameraOn).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // 2. Screen share rejection when another user is already sharing
  // ---------------------------------------------------------------
  describe('screen share rejection', () => {
    it('should reject screen share if another user is already sharing', async () => {
      const alice = createMockSocket({ id: 'socket-a', userId: 'user-a', displayName: 'Alice' });
      const bob = createMockSocket({ id: 'socket-b', userId: 'user-b', displayName: 'Bob' });

      await joinPeer(alice, 'room-1');
      await joinPeer(bob, 'room-1');

      // Alice starts sharing
      gateway.handleMediaState(alice as any, {
        roomId: 'room-1',
        isCameraOn: false,
        isScreenSharing: true,
      });

      // Bob attempts to share
      gateway.handleMediaState(bob as any, {
        roomId: 'room-1',
        isCameraOn: false,
        isScreenSharing: true,
      });

      expect(bob.emit).toHaveBeenCalledWith('signal:error', {
        message: 'Another user is already sharing their screen',
      });

      // Screen sharer should still be Alice
      expect((gateway as any).roomScreenSharer.get('room-1')).toBe('user-a');
    });

    it('should allow the same user to update their own screen share', async () => {
      const alice = createMockSocket({ id: 'socket-a', userId: 'user-a', displayName: 'Alice' });
      await joinPeer(alice, 'room-1');

      gateway.handleMediaState(alice as any, {
        roomId: 'room-1',
        isCameraOn: false,
        isScreenSharing: true,
      });

      // Alice sends another media state with screen sharing still on
      alice.emit.mockClear();
      gateway.handleMediaState(alice as any, {
        roomId: 'room-1',
        isCameraOn: true,
        isScreenSharing: true,
      });

      // Should NOT receive an error
      expect(alice.emit).not.toHaveBeenCalledWith('signal:error', expect.anything());
    });

    it('should allow a new user to share after previous sharer stops', async () => {
      const alice = createMockSocket({ id: 'socket-a', userId: 'user-a', displayName: 'Alice' });
      const bob = createMockSocket({ id: 'socket-b', userId: 'user-b', displayName: 'Bob' });

      await joinPeer(alice, 'room-1');
      await joinPeer(bob, 'room-1');

      // Alice starts then stops sharing
      gateway.handleMediaState(alice as any, {
        roomId: 'room-1',
        isCameraOn: false,
        isScreenSharing: true,
      });
      gateway.handleMediaState(alice as any, {
        roomId: 'room-1',
        isCameraOn: false,
        isScreenSharing: false,
      });

      // Bob should now be allowed to share
      bob.emit.mockClear();
      const broadcastEmit = jest.fn();
      bob.to.mockReturnValue({ emit: broadcastEmit });

      gateway.handleMediaState(bob as any, {
        roomId: 'room-1',
        isCameraOn: false,
        isScreenSharing: true,
      });

      expect(bob.emit).not.toHaveBeenCalledWith('signal:error', expect.anything());
      expect(broadcastEmit).toHaveBeenCalledWith(
        SIGNAL_EVENTS.MEDIA_STATE,
        expect.objectContaining({ userId: 'user-b', isScreenSharing: true }),
      );
    });
  });

  // ---------------------------------------------------------------
  // 3. Screen share cleanup on peer disconnect (removePeer)
  // ---------------------------------------------------------------
  describe('screen share cleanup on disconnect', () => {
    it('should clear screen sharer and broadcast reset when sharing peer disconnects', async () => {
      const alice = createMockSocket({ id: 'socket-a', userId: 'user-a', displayName: 'Alice' });
      const bob = createMockSocket({ id: 'socket-b', userId: 'user-b', displayName: 'Bob' });

      await joinPeer(alice, 'room-1');
      await joinPeer(bob, 'room-1');

      // Alice starts sharing
      gateway.handleMediaState(alice as any, {
        roomId: 'room-1',
        isCameraOn: false,
        isScreenSharing: true,
      });

      const serverEmit = jest.fn();
      mockServer.to.mockReturnValue({ emit: serverEmit });

      // Alice disconnects
      await gateway.handleDisconnect(alice as any);

      // Screen share should be cleaned up
      expect((gateway as any).roomScreenSharer.has('room-1')).toBe(false);

      // Server should broadcast media state reset for Alice
      expect(mockServer.to).toHaveBeenCalledWith('signal:room-1');
      expect(serverEmit).toHaveBeenCalledWith(SIGNAL_EVENTS.MEDIA_STATE, {
        roomId: 'room-1',
        userId: 'user-a',
        isCameraOn: false,
        isScreenSharing: false,
      });
    });

    it('should NOT broadcast screen share reset if disconnecting peer was not sharing', async () => {
      const alice = createMockSocket({ id: 'socket-a', userId: 'user-a', displayName: 'Alice' });
      const bob = createMockSocket({ id: 'socket-b', userId: 'user-b', displayName: 'Bob' });

      await joinPeer(alice, 'room-1');
      await joinPeer(bob, 'room-1');

      const serverEmit = jest.fn();
      mockServer.to.mockReturnValue({ emit: serverEmit });

      // Bob disconnects (was not sharing)
      await gateway.handleDisconnect(bob as any);

      // Should emit PEER_LEFT but NOT MEDIA_STATE
      const mediaStateCalls = serverEmit.mock.calls.filter(
        (call) => call[0] === SIGNAL_EVENTS.MEDIA_STATE,
      );
      expect(mediaStateCalls).toHaveLength(0);
    });

    it('should allow a new sharer after previous sharer disconnected', async () => {
      const alice = createMockSocket({ id: 'socket-a', userId: 'user-a', displayName: 'Alice' });
      const bob = createMockSocket({ id: 'socket-b', userId: 'user-b', displayName: 'Bob' });

      await joinPeer(alice, 'room-1');
      await joinPeer(bob, 'room-1');

      // Alice shares then disconnects
      gateway.handleMediaState(alice as any, {
        roomId: 'room-1',
        isCameraOn: false,
        isScreenSharing: true,
      });
      mockServer.to.mockReturnValue({ emit: jest.fn() });
      await gateway.handleDisconnect(alice as any);

      // Bob should now be able to share
      bob.emit.mockClear();
      const broadcastEmit = jest.fn();
      bob.to.mockReturnValue({ emit: broadcastEmit });

      gateway.handleMediaState(bob as any, {
        roomId: 'room-1',
        isCameraOn: false,
        isScreenSharing: true,
      });

      expect(bob.emit).not.toHaveBeenCalledWith('signal:error', expect.anything());
      expect((gateway as any).roomScreenSharer.get('room-1')).toBe('user-b');
    });
  });

  // ---------------------------------------------------------------
  // 4. isCameraOn / isScreenSharing included in ROOM_PEERS and PEER_JOINED
  // ---------------------------------------------------------------
  describe('media flags in ROOM_PEERS and PEER_JOINED', () => {
    it('should include isCameraOn and isScreenSharing in ROOM_PEERS sent to new joiner', async () => {
      const alice = createMockSocket({ id: 'socket-a', userId: 'user-a', displayName: 'Alice' });
      await joinPeer(alice, 'room-1');

      // Alice turns on camera
      gateway.handleMediaState(alice as any, {
        roomId: 'room-1',
        isCameraOn: true,
        isScreenSharing: false,
      });

      // Bob joins
      const bob = createMockSocket({ id: 'socket-b', userId: 'user-b', displayName: 'Bob' });
      await joinPeer(bob, 'room-1');

      // Bob should have received ROOM_PEERS with Alice's state
      const roomPeersCall = bob.emit.mock.calls.find(
        (call) => call[0] === SIGNAL_EVENTS.ROOM_PEERS,
      );
      expect(roomPeersCall).toBeDefined();

      const peersPayload = roomPeersCall![1];
      expect(peersPayload.roomId).toBe('room-1');
      expect(peersPayload.peers).toHaveLength(1);
      expect(peersPayload.peers[0]).toMatchObject({
        userId: 'user-a',
        isCameraOn: true,
        isScreenSharing: false,
      });
    });

    it('should include isCameraOn and isScreenSharing in PEER_JOINED broadcast', async () => {
      const alice = createMockSocket({ id: 'socket-a', userId: 'user-a', displayName: 'Alice' });
      await joinPeer(alice, 'room-1');

      // Capture broadcasts from alice socket when Bob joins
      const broadcastEmit = jest.fn();
      alice.to.mockReturnValue({ emit: broadcastEmit });

      const bob = createMockSocket({ id: 'socket-b', userId: 'user-b', displayName: 'Bob' });
      await joinPeer(bob, 'room-1');

      // Bob's join should trigger PEER_JOINED broadcast that Alice receives
      // The broadcast goes through bob.to(), so check bob's to().emit
      const bobBroadcastEmit = jest.fn();
      bob.to.mockReturnValue({ emit: bobBroadcastEmit });

      // Re-join Bob to capture the broadcast
      // Actually, let's check the join that already happened
      // bob.to was called during joinPeer — get the emit calls from its return
      const peerJoinedCalls = bob.to.mock.results
        .map((r) => r.value)
        .filter(Boolean)
        .flatMap((toBranch) =>
          (toBranch.emit?.mock?.calls ?? []).filter(
            (call: any[]) => call[0] === SIGNAL_EVENTS.PEER_JOINED,
          ),
        );

      expect(peerJoinedCalls.length).toBeGreaterThanOrEqual(1);
      const peerJoinedPayload = peerJoinedCalls[0][1];
      expect(peerJoinedPayload.peer).toMatchObject({
        userId: 'user-b',
        isCameraOn: false,
        isScreenSharing: false,
      });
    });

    it('should include isScreenSharing true for a peer that is sharing', async () => {
      const alice = createMockSocket({ id: 'socket-a', userId: 'user-a', displayName: 'Alice' });
      await joinPeer(alice, 'room-1');

      // Alice starts screen sharing
      gateway.handleMediaState(alice as any, {
        roomId: 'room-1',
        isCameraOn: false,
        isScreenSharing: true,
      });

      const bob = createMockSocket({ id: 'socket-b', userId: 'user-b', displayName: 'Bob' });
      await joinPeer(bob, 'room-1');

      const roomPeersCall = bob.emit.mock.calls.find(
        (call) => call[0] === SIGNAL_EVENTS.ROOM_PEERS,
      );
      expect(roomPeersCall![1].peers[0]).toMatchObject({
        userId: 'user-a',
        isScreenSharing: true,
      });
    });
  });

  // ---------------------------------------------------------------
  // 5. streamMeta relay in offer/answer
  // ---------------------------------------------------------------
  describe('streamMeta relay in offer/answer', () => {
    it('should relay streamMeta in OFFER to the target peer', async () => {
      const alice = createMockSocket({ id: 'socket-a', userId: 'user-a', displayName: 'Alice' });
      const bob = createMockSocket({ id: 'socket-b', userId: 'user-b', displayName: 'Bob' });

      await joinPeer(alice, 'room-1');
      await joinPeer(bob, 'room-1');

      const serverEmit = jest.fn();
      mockServer.to.mockReturnValue({ emit: serverEmit });

      gateway.handleOffer(alice as any, {
        roomId: 'room-1',
        targetUserId: 'user-b',
        sdp: { type: 'offer', sdp: 'v=0...' },
        streamMeta: { 'track-1': 'camera', 'track-2': 'screen' },
      });

      expect(mockServer.to).toHaveBeenCalledWith('socket-b');
      expect(serverEmit).toHaveBeenCalledWith(SIGNAL_EVENTS.OFFER, {
        roomId: 'room-1',
        fromUserId: 'user-a',
        sdp: { type: 'offer', sdp: 'v=0...' },
        streamMeta: { 'track-1': 'camera', 'track-2': 'screen' },
      });
    });

    it('should relay streamMeta in ANSWER to the target peer', async () => {
      const alice = createMockSocket({ id: 'socket-a', userId: 'user-a', displayName: 'Alice' });
      const bob = createMockSocket({ id: 'socket-b', userId: 'user-b', displayName: 'Bob' });

      await joinPeer(alice, 'room-1');
      await joinPeer(bob, 'room-1');

      const serverEmit = jest.fn();
      mockServer.to.mockReturnValue({ emit: serverEmit });

      gateway.handleAnswer(bob as any, {
        roomId: 'room-1',
        targetUserId: 'user-a',
        sdp: { type: 'answer', sdp: 'v=0...' },
        streamMeta: { 'track-3': 'camera' },
      });

      expect(mockServer.to).toHaveBeenCalledWith('socket-a');
      expect(serverEmit).toHaveBeenCalledWith(SIGNAL_EVENTS.ANSWER, {
        roomId: 'room-1',
        fromUserId: 'user-b',
        sdp: { type: 'answer', sdp: 'v=0...' },
        streamMeta: { 'track-3': 'camera' },
      });
    });

    it('should relay offer without streamMeta when not provided', async () => {
      const alice = createMockSocket({ id: 'socket-a', userId: 'user-a', displayName: 'Alice' });
      const bob = createMockSocket({ id: 'socket-b', userId: 'user-b', displayName: 'Bob' });

      await joinPeer(alice, 'room-1');
      await joinPeer(bob, 'room-1');

      const serverEmit = jest.fn();
      mockServer.to.mockReturnValue({ emit: serverEmit });

      gateway.handleOffer(alice as any, {
        roomId: 'room-1',
        targetUserId: 'user-b',
        sdp: { type: 'offer', sdp: 'v=0...' },
      });

      expect(serverEmit).toHaveBeenCalledWith(SIGNAL_EVENTS.OFFER, {
        roomId: 'room-1',
        fromUserId: 'user-a',
        sdp: { type: 'offer', sdp: 'v=0...' },
        streamMeta: undefined,
      });
    });
  });
});
