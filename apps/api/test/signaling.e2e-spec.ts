import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SIGNALING_NAMESPACE, SIGNAL_EVENTS } from '@nestlyx/shared';

describe('Signaling Gateway (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let port: number;

  const mockPrismaService = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: {
      create: jest.fn(),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === 'user-1') {
          return Promise.resolve({ id: 'user-1', displayName: 'Alice', email: 'alice@test.com' });
        }
        if (where.id === 'user-2') {
          return Promise.resolve({ id: 'user-2', displayName: 'Bob', email: 'bob@test.com' });
        }
        if (where.id === 'user-3') {
          return Promise.resolve({ id: 'user-3', displayName: 'Charlie', email: 'charlie@test.com' });
        }
        return Promise.resolve(null);
      }),
    },
    workspace: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
    workspaceMember: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
    room: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    participant: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      upsert: jest.fn().mockResolvedValue({}),
    },
    chatMessage: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    recording: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
    meetingEvent: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  };

  function createToken(userId: string): string {
    return jwtService.sign({ sub: userId, email: `${userId}@test.com` });
  }

  function connectClient(userId: string): Socket {
    const token = createToken(userId);
    return io(`http://localhost:${port}${SIGNALING_NAMESPACE}`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
  }

  function waitFor<T>(socket: Socket, event: string, timeout = 3000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
      socket.once(event, (data: T) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(0);

    const server = app.getHttpServer();
    const address = server.address();
    port = typeof address === 'string' ? parseInt(address) : address.port;

    jwtService = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Join room and peer discovery', () => {
    let client1: Socket;
    let client2: Socket;
    const roomId = 'room-join-test';

    afterEach(() => {
      client1?.disconnect();
      client2?.disconnect();
    });

    it('should receive ROOM_PEERS with isCameraOn/isScreenSharing fields', async () => {
      client1 = connectClient('user-1');
      await new Promise<void>((r) => client1.on('connect', r));

      // User 1 joins room
      const peersPromise = waitFor<any>(client1, SIGNAL_EVENTS.ROOM_PEERS);
      client1.emit(SIGNAL_EVENTS.JOIN_ROOM, { roomId });
      const peersData = await peersPromise;

      expect(peersData.roomId).toBe(roomId);
      expect(peersData.peers).toEqual([]);

      // User 2 joins — User 1 should get PEER_JOINED
      client2 = connectClient('user-2');
      await new Promise<void>((r) => client2.on('connect', r));

      const joinedPromise = waitFor<any>(client1, SIGNAL_EVENTS.PEER_JOINED);
      const peers2Promise = waitFor<any>(client2, SIGNAL_EVENTS.ROOM_PEERS);
      client2.emit(SIGNAL_EVENTS.JOIN_ROOM, { roomId });

      const [joinedData, peers2Data] = await Promise.all([joinedPromise, peers2Promise]);

      // PEER_JOINED should include media state fields
      expect(joinedData.peer).toMatchObject({
        userId: 'user-2',
        isMuted: false,
        isCameraOn: false,
        isScreenSharing: false,
      });

      // ROOM_PEERS for user 2 should include user 1 with media state
      expect(peers2Data.peers).toHaveLength(1);
      expect(peers2Data.peers[0]).toMatchObject({
        userId: 'user-1',
        isCameraOn: false,
        isScreenSharing: false,
      });
    });
  });

  describe('Media state', () => {
    let client1: Socket;
    let client2: Socket;
    const roomId = 'room-media-test';

    beforeEach(async () => {
      client1 = connectClient('user-1');
      client2 = connectClient('user-2');
      await Promise.all([
        new Promise<void>((r) => client1.on('connect', r)),
        new Promise<void>((r) => client2.on('connect', r)),
      ]);

      // Both join room
      const peers1Promise = waitFor<any>(client1, SIGNAL_EVENTS.ROOM_PEERS);
      client1.emit(SIGNAL_EVENTS.JOIN_ROOM, { roomId });
      await peers1Promise;

      const peers2Promise = waitFor<any>(client2, SIGNAL_EVENTS.ROOM_PEERS);
      const joinedPromise = waitFor<any>(client1, SIGNAL_EVENTS.PEER_JOINED);
      client2.emit(SIGNAL_EVENTS.JOIN_ROOM, { roomId });
      await Promise.all([peers2Promise, joinedPromise]);
    });

    afterEach(() => {
      client1?.disconnect();
      client2?.disconnect();
    });

    it('should broadcast camera state to other peers', async () => {
      const mediaPromise = waitFor<any>(client1, SIGNAL_EVENTS.MEDIA_STATE);
      client2.emit(SIGNAL_EVENTS.MEDIA_STATE, {
        roomId,
        isCameraOn: true,
        isScreenSharing: false,
      });

      const mediaData = await mediaPromise;
      expect(mediaData).toMatchObject({
        roomId,
        userId: 'user-2',
        isCameraOn: true,
        isScreenSharing: false,
      });
    });

    it('should broadcast screen share state to other peers', async () => {
      const mediaPromise = waitFor<any>(client1, SIGNAL_EVENTS.MEDIA_STATE);
      client2.emit(SIGNAL_EVENTS.MEDIA_STATE, {
        roomId,
        isCameraOn: false,
        isScreenSharing: true,
      });

      const mediaData = await mediaPromise;
      expect(mediaData).toMatchObject({
        userId: 'user-2',
        isScreenSharing: true,
      });
    });

    it('should include updated media state in ROOM_PEERS for new joiners', async () => {
      // User 2 turns on camera
      const mediaPromise = waitFor<any>(client1, SIGNAL_EVENTS.MEDIA_STATE);
      client2.emit(SIGNAL_EVENTS.MEDIA_STATE, {
        roomId,
        isCameraOn: true,
        isScreenSharing: false,
      });
      await mediaPromise;

      // New user joins and should see user 2's camera state
      const client3 = connectClient('user-3');
      await new Promise<void>((r) => client3.on('connect', r));

      const peers3Promise = waitFor<any>(client3, SIGNAL_EVENTS.ROOM_PEERS);
      client3.emit(SIGNAL_EVENTS.JOIN_ROOM, { roomId });
      const peers3Data = await peers3Promise;

      const user2Peer = peers3Data.peers.find((p: any) => p.userId === 'user-2');
      expect(user2Peer).toMatchObject({
        isCameraOn: true,
        isScreenSharing: false,
      });

      client3.disconnect();
    });
  });

  describe('Screen share enforcement', () => {
    let client1: Socket;
    let client2: Socket;
    const roomId = 'room-screen-enforce';

    beforeEach(async () => {
      client1 = connectClient('user-1');
      client2 = connectClient('user-2');
      await Promise.all([
        new Promise<void>((r) => client1.on('connect', r)),
        new Promise<void>((r) => client2.on('connect', r)),
      ]);

      const peers1Promise = waitFor<any>(client1, SIGNAL_EVENTS.ROOM_PEERS);
      client1.emit(SIGNAL_EVENTS.JOIN_ROOM, { roomId });
      await peers1Promise;

      const peers2Promise = waitFor<any>(client2, SIGNAL_EVENTS.ROOM_PEERS);
      const joinedPromise = waitFor<any>(client1, SIGNAL_EVENTS.PEER_JOINED);
      client2.emit(SIGNAL_EVENTS.JOIN_ROOM, { roomId });
      await Promise.all([peers2Promise, joinedPromise]);
    });

    afterEach(() => {
      client1?.disconnect();
      client2?.disconnect();
    });

    it('should reject second screen share and send error', async () => {
      // User 1 starts screen share
      const media1Promise = waitFor<any>(client2, SIGNAL_EVENTS.MEDIA_STATE);
      client1.emit(SIGNAL_EVENTS.MEDIA_STATE, {
        roomId,
        isCameraOn: false,
        isScreenSharing: true,
      });
      await media1Promise;

      // User 2 tries to screen share — should get error
      const errorPromise = waitFor<any>(client2, 'signal:error');
      client2.emit(SIGNAL_EVENTS.MEDIA_STATE, {
        roomId,
        isCameraOn: false,
        isScreenSharing: true,
      });

      const errorData = await errorPromise;
      expect(errorData.message).toContain('already sharing');
    });

    it('should allow screen share after previous sharer stops', async () => {
      // User 1 starts screen share
      const media1Promise = waitFor<any>(client2, SIGNAL_EVENTS.MEDIA_STATE);
      client1.emit(SIGNAL_EVENTS.MEDIA_STATE, {
        roomId,
        isCameraOn: false,
        isScreenSharing: true,
      });
      await media1Promise;

      // User 1 stops screen share
      const stopPromise = waitFor<any>(client2, SIGNAL_EVENTS.MEDIA_STATE);
      client1.emit(SIGNAL_EVENTS.MEDIA_STATE, {
        roomId,
        isCameraOn: false,
        isScreenSharing: false,
      });
      await stopPromise;

      // User 2 should now be able to screen share
      const media2Promise = waitFor<any>(client1, SIGNAL_EVENTS.MEDIA_STATE);
      client2.emit(SIGNAL_EVENTS.MEDIA_STATE, {
        roomId,
        isCameraOn: false,
        isScreenSharing: true,
      });

      const mediaData = await media2Promise;
      expect(mediaData).toMatchObject({
        userId: 'user-2',
        isScreenSharing: true,
      });
    });

    it('should clean up screen share when sharer disconnects', async () => {
      // User 1 starts screen share
      const media1Promise = waitFor<any>(client2, SIGNAL_EVENTS.MEDIA_STATE);
      client1.emit(SIGNAL_EVENTS.MEDIA_STATE, {
        roomId,
        isCameraOn: false,
        isScreenSharing: true,
      });
      await media1Promise;

      // User 1 disconnects — user 2 should get MEDIA_STATE with isScreenSharing: false
      const cleanupPromise = waitFor<any>(client2, SIGNAL_EVENTS.MEDIA_STATE);
      client1.disconnect();

      const cleanupData = await cleanupPromise;
      expect(cleanupData).toMatchObject({
        userId: 'user-1',
        isScreenSharing: false,
      });

      // User 2 should now be able to screen share
      // Need a new client to join (reconnect a 3rd user to verify)
      const client3 = connectClient('user-3');
      await new Promise<void>((r) => client3.on('connect', r));
      const peers3Promise = waitFor<any>(client3, SIGNAL_EVENTS.ROOM_PEERS);
      client3.emit(SIGNAL_EVENTS.JOIN_ROOM, { roomId });
      await peers3Promise;

      const media3Promise = waitFor<any>(client2, SIGNAL_EVENTS.MEDIA_STATE);
      client3.emit(SIGNAL_EVENTS.MEDIA_STATE, {
        roomId,
        isCameraOn: false,
        isScreenSharing: true,
      });

      const media3Data = await media3Promise;
      expect(media3Data).toMatchObject({
        userId: 'user-3',
        isScreenSharing: true,
      });

      client3.disconnect();
    });
  });

  describe('Offer/Answer with streamMeta', () => {
    let client1: Socket;
    let client2: Socket;
    const roomId = 'room-streammeta-test';

    beforeEach(async () => {
      client1 = connectClient('user-1');
      client2 = connectClient('user-2');
      await Promise.all([
        new Promise<void>((r) => client1.on('connect', r)),
        new Promise<void>((r) => client2.on('connect', r)),
      ]);

      const peers1Promise = waitFor<any>(client1, SIGNAL_EVENTS.ROOM_PEERS);
      client1.emit(SIGNAL_EVENTS.JOIN_ROOM, { roomId });
      await peers1Promise;

      const peers2Promise = waitFor<any>(client2, SIGNAL_EVENTS.ROOM_PEERS);
      const joinedPromise = waitFor<any>(client1, SIGNAL_EVENTS.PEER_JOINED);
      client2.emit(SIGNAL_EVENTS.JOIN_ROOM, { roomId });
      await Promise.all([peers2Promise, joinedPromise]);
    });

    afterEach(() => {
      client1?.disconnect();
      client2?.disconnect();
    });

    it('should relay streamMeta in offer', async () => {
      const streamMeta = { 'stream-1': 'audio', 'stream-2': 'camera' };
      const offerPromise = waitFor<any>(client2, SIGNAL_EVENTS.OFFER);
      client1.emit(SIGNAL_EVENTS.OFFER, {
        roomId,
        targetUserId: 'user-2',
        sdp: { type: 'offer', sdp: 'mock-sdp' },
        streamMeta,
      });

      const offerData = await offerPromise;
      expect(offerData.fromUserId).toBe('user-1');
      expect(offerData.streamMeta).toEqual(streamMeta);
      expect(offerData.sdp).toEqual({ type: 'offer', sdp: 'mock-sdp' });
    });

    it('should relay streamMeta in answer', async () => {
      const streamMeta = { 'stream-3': 'screen' };
      const answerPromise = waitFor<any>(client1, SIGNAL_EVENTS.ANSWER);
      client2.emit(SIGNAL_EVENTS.ANSWER, {
        roomId,
        targetUserId: 'user-1',
        sdp: { type: 'answer', sdp: 'mock-answer-sdp' },
        streamMeta,
      });

      const answerData = await answerPromise;
      expect(answerData.fromUserId).toBe('user-2');
      expect(answerData.streamMeta).toEqual(streamMeta);
    });

    it('should handle offer without streamMeta', async () => {
      const offerPromise = waitFor<any>(client2, SIGNAL_EVENTS.OFFER);
      client1.emit(SIGNAL_EVENTS.OFFER, {
        roomId,
        targetUserId: 'user-2',
        sdp: { type: 'offer', sdp: 'mock-sdp' },
      });

      const offerData = await offerPromise;
      expect(offerData.fromUserId).toBe('user-1');
      expect(offerData.streamMeta).toBeUndefined();
    });
  });

  describe('Peer lifecycle', () => {
    const roomId = 'room-lifecycle-test';

    it('should notify peers when someone leaves via LEAVE_ROOM', async () => {
      const client1 = connectClient('user-1');
      const client2 = connectClient('user-2');
      await Promise.all([
        new Promise<void>((r) => client1.on('connect', r)),
        new Promise<void>((r) => client2.on('connect', r)),
      ]);

      const peers1Promise = waitFor<any>(client1, SIGNAL_EVENTS.ROOM_PEERS);
      client1.emit(SIGNAL_EVENTS.JOIN_ROOM, { roomId });
      await peers1Promise;

      const peers2Promise = waitFor<any>(client2, SIGNAL_EVENTS.ROOM_PEERS);
      const joinedPromise = waitFor<any>(client1, SIGNAL_EVENTS.PEER_JOINED);
      client2.emit(SIGNAL_EVENTS.JOIN_ROOM, { roomId });
      await Promise.all([peers2Promise, joinedPromise]);

      // User 2 leaves
      const leftPromise = waitFor<any>(client1, SIGNAL_EVENTS.PEER_LEFT);
      client2.emit(SIGNAL_EVENTS.LEAVE_ROOM, {});
      const leftData = await leftPromise;
      expect(leftData).toMatchObject({ roomId, userId: 'user-2' });

      client1.disconnect();
      client2.disconnect();
    });

    it('should notify peers when someone disconnects', async () => {
      const client1 = connectClient('user-1');
      const client2 = connectClient('user-2');
      await Promise.all([
        new Promise<void>((r) => client1.on('connect', r)),
        new Promise<void>((r) => client2.on('connect', r)),
      ]);

      const peers1Promise = waitFor<any>(client1, SIGNAL_EVENTS.ROOM_PEERS);
      client1.emit(SIGNAL_EVENTS.JOIN_ROOM, { roomId });
      await peers1Promise;

      const peers2Promise = waitFor<any>(client2, SIGNAL_EVENTS.ROOM_PEERS);
      const joinedPromise = waitFor<any>(client1, SIGNAL_EVENTS.PEER_JOINED);
      client2.emit(SIGNAL_EVENTS.JOIN_ROOM, { roomId });
      await Promise.all([peers2Promise, joinedPromise]);

      // User 2 force disconnects
      const leftPromise = waitFor<any>(client1, SIGNAL_EVENTS.PEER_LEFT);
      client2.disconnect();
      const leftData = await leftPromise;
      expect(leftData).toMatchObject({ userId: 'user-2' });

      client1.disconnect();
    });

    it('should include displayName from user lookup', async () => {
      const client1 = connectClient('user-1');
      const client2 = connectClient('user-2');
      await Promise.all([
        new Promise<void>((r) => client1.on('connect', r)),
        new Promise<void>((r) => client2.on('connect', r)),
      ]);

      const peers1Promise = waitFor<any>(client1, SIGNAL_EVENTS.ROOM_PEERS);
      client1.emit(SIGNAL_EVENTS.JOIN_ROOM, { roomId });
      await peers1Promise;

      const joinedPromise = waitFor<any>(client1, SIGNAL_EVENTS.PEER_JOINED);
      client2.emit(SIGNAL_EVENTS.JOIN_ROOM, { roomId });
      const joinedData = await joinedPromise;

      expect(joinedData.peer.displayName).toBe('Bob');

      client1.disconnect();
      client2.disconnect();
    });
  });
});
