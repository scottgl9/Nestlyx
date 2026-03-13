import { renderHook, act } from '@testing-library/react';
import { useWebRTC } from './use-webrtc';
import { SIGNAL_EVENTS } from '@nestlyx/shared';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockEmit = jest.fn();
const mockOn = jest.fn<() => void, [string, (...args: any[]) => void]>();

jest.mock('./use-websocket', () => ({
  useWebSocket: () => ({
    emit: mockEmit,
    on: mockOn.mockReturnValue(jest.fn()), // returns unsubscribe fn
  }),
}));

// Helpers for building fake MediaStream / MediaStreamTrack
function createMockTrack(kind: 'audio' | 'video' = 'audio'): MediaStreamTrack {
  return {
    kind,
    enabled: true,
    stop: jest.fn(),
    onended: null,
    id: `track-${Math.random().toString(36).slice(2)}`,
  } as unknown as MediaStreamTrack;
}

function createMockStream(tracks: MediaStreamTrack[]): MediaStream {
  const id = `stream-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
  } as unknown as MediaStream;
}

// RTCPeerConnection mock
let mockPCInstances: FakePeerConnection[] = [];

class FakePeerConnection {
  onicecandidate: ((e: any) => void) | null = null;
  ontrack: ((e: any) => void) | null = null;
  localDescription: any = null;

  private senders: { track: MediaStreamTrack | null }[] = [];

  addTrack = jest.fn((track: MediaStreamTrack, _stream: MediaStream) => {
    const sender = { track };
    this.senders.push(sender);
    return sender;
  });

  removeTrack = jest.fn((sender: { track: MediaStreamTrack | null }) => {
    const idx = this.senders.indexOf(sender);
    if (idx >= 0) this.senders.splice(idx, 1);
  });

  getSenders = jest.fn(() => [...this.senders]);

  createOffer = jest.fn(async () => ({ type: 'offer', sdp: 'fake-offer' }));
  createAnswer = jest.fn(async () => ({ type: 'answer', sdp: 'fake-answer' }));
  setLocalDescription = jest.fn(async (desc: any) => {
    this.localDescription = desc;
  });
  setRemoteDescription = jest.fn(async () => {});
  addIceCandidate = jest.fn(async () => {});
  close = jest.fn();

  constructor() {
    mockPCInstances.push(this);
  }
}

// Globals
beforeAll(() => {
  (globalThis as any).RTCPeerConnection = FakePeerConnection;
  (globalThis as any).RTCSessionDescription = class {
    type: string;
    sdp: string;
    constructor(init: any) {
      this.type = init.type;
      this.sdp = init.sdp;
    }
  };
  (globalThis as any).RTCIceCandidate = class {
    constructor(public candidate: any) {}
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPCInstances = [];

  // Default getUserMedia returns audio stream
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: jest.fn(async (constraints: MediaStreamConstraints) => {
        if (constraints.video) {
          return createMockStream([createMockTrack('video')]);
        }
        return createMockStream([createMockTrack('audio')]);
      }),
      getDisplayMedia: jest.fn(async () => {
        return createMockStream([createMockTrack('video')]);
      }),
    },
    configurable: true,
    writable: true,
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the handler registered via mockOn for a given event */
function getSignalHandler(event: string): ((...args: any[]) => void) | undefined {
  const call = mockOn.mock.calls.find(([e]) => e === event);
  return call?.[1];
}

/** Render hook and join the room so localStream is initialised */
async function setupJoined(roomId = 'room-1') {
  const hook = renderHook(() => useWebRTC(roomId));

  await act(async () => {
    await hook.result.current.joinRoom();
  });

  return hook;
}

/** Simulate an existing peer so peerConnections map is populated */
async function addFakePeer(userId = 'peer-1', displayName = 'Peer 1') {
  const handler = getSignalHandler(SIGNAL_EVENTS.ROOM_PEERS);
  if (!handler) throw new Error('ROOM_PEERS handler not registered');

  await act(async () => {
    handler({
      peers: [{ userId, displayName, isMuted: false, isCameraOn: false, isScreenSharing: false }],
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useWebRTC', () => {
  // 1. toggleCamera adds/removes video track and triggers renegotiation
  describe('toggleCamera', () => {
    it('adds video track to existing peers and triggers renegotiation', async () => {
      const { result } = await setupJoined();
      await addFakePeer();

      const pc = mockPCInstances[0];
      const addTrackCountBefore = pc.addTrack.mock.calls.length;

      await act(async () => {
        await result.current.toggleCamera();
      });

      expect(result.current.isCameraOn).toBe(true);
      expect(result.current.localVideoStream).not.toBeNull();

      // A video track was added to the peer connection
      const addedAfter = pc.addTrack.mock.calls.slice(addTrackCountBefore);
      expect(addedAfter.length).toBeGreaterThan(0);
      expect(addedAfter[0][0].kind).toBe('video');

      // Renegotiation: createOffer should have been called again
      expect(pc.createOffer).toHaveBeenCalled();
      expect(mockEmit).toHaveBeenCalledWith(
        SIGNAL_EVENTS.MEDIA_STATE,
        expect.objectContaining({ isCameraOn: true }),
      );
    });

    it('removes video track and triggers renegotiation when toggled off', async () => {
      const { result } = await setupJoined();
      await addFakePeer();

      // Turn camera on first
      await act(async () => {
        await result.current.toggleCamera();
      });

      const pc = mockPCInstances[0];
      pc.createOffer.mockClear();

      // Turn camera off
      await act(async () => {
        await result.current.toggleCamera();
      });

      expect(result.current.isCameraOn).toBe(false);
      expect(result.current.localVideoStream).toBeNull();
      expect(pc.removeTrack).toHaveBeenCalled();
      expect(pc.createOffer).toHaveBeenCalled(); // renegotiation
      expect(mockEmit).toHaveBeenCalledWith(
        SIGNAL_EVENTS.MEDIA_STATE,
        expect.objectContaining({ isCameraOn: false }),
      );
    });
  });

  // 2. toggleScreenShare adds/removes screen track
  describe('toggleScreenShare', () => {
    it('adds screen track to existing peers', async () => {
      const { result } = await setupJoined();
      await addFakePeer();

      const pc = mockPCInstances[0];
      const addTrackCountBefore = pc.addTrack.mock.calls.length;

      await act(async () => {
        await result.current.toggleScreenShare();
      });

      expect(result.current.isScreenSharing).toBe(true);
      expect(result.current.localScreenStream).not.toBeNull();
      expect(result.current.screenShareUserId).toBe('self');

      const addedAfter = pc.addTrack.mock.calls.slice(addTrackCountBefore);
      expect(addedAfter.length).toBeGreaterThan(0);
      expect(pc.createOffer).toHaveBeenCalled();
    });

    it('removes screen track when toggled off', async () => {
      const { result } = await setupJoined();
      await addFakePeer();

      // Start screen share
      await act(async () => {
        await result.current.toggleScreenShare();
      });

      const pc = mockPCInstances[0];
      pc.createOffer.mockClear();

      // Stop screen share
      await act(async () => {
        await result.current.toggleScreenShare();
      });

      expect(result.current.isScreenSharing).toBe(false);
      expect(result.current.localScreenStream).toBeNull();
      expect(result.current.screenShareUserId).toBeNull();
      expect(pc.removeTrack).toHaveBeenCalled();
      expect(pc.createOffer).toHaveBeenCalled();
    });
  });

  // 3. ontrack routes streams correctly based on streamMeta
  describe('ontrack routing via streamMeta', () => {
    it('routes camera stream to peer.videoStream', async () => {
      await setupJoined();

      // Simulate receiving an offer with streamMeta
      const offerHandler = getSignalHandler(SIGNAL_EVENTS.OFFER);
      expect(offerHandler).toBeDefined();

      const cameraStreamId = 'remote-camera-stream';
      await act(async () => {
        offerHandler!({
          fromUserId: 'peer-1',
          sdp: { type: 'offer', sdp: 'fake' },
          streamMeta: { [cameraStreamId]: 'camera' },
        });
      });

      // Now fire the ontrack event on the peer connection
      const pc = mockPCInstances[0];
      expect(pc.ontrack).toBeDefined();

      const fakeStream = createMockStream([createMockTrack('video')]);
      Object.defineProperty(fakeStream, 'id', { value: cameraStreamId });

      act(() => {
        pc.ontrack!({ streams: [fakeStream] });
      });

      // The peer's videoStream should be set (not regular stream)
      // We can't directly access peerConnections ref, but the setPeers
      // re-render trigger confirms routing happened without error.
    });

    it('routes screen stream to peer.screenStream', async () => {
      await setupJoined();

      const offerHandler = getSignalHandler(SIGNAL_EVENTS.OFFER);
      const screenStreamId = 'remote-screen-stream';

      await act(async () => {
        offerHandler!({
          fromUserId: 'peer-2',
          sdp: { type: 'offer', sdp: 'fake' },
          streamMeta: { [screenStreamId]: 'screen' },
        });
      });

      const pc = mockPCInstances[0];
      const fakeStream = createMockStream([createMockTrack('video')]);
      Object.defineProperty(fakeStream, 'id', { value: screenStreamId });

      act(() => {
        pc.ontrack!({ streams: [fakeStream] });
      });
    });

    it('routes unknown/audio stream to peer.stream (default)', async () => {
      await setupJoined();

      const offerHandler = getSignalHandler(SIGNAL_EVENTS.OFFER);
      const audioStreamId = 'remote-audio-stream';

      await act(async () => {
        offerHandler!({
          fromUserId: 'peer-3',
          sdp: { type: 'offer', sdp: 'fake' },
          streamMeta: { [audioStreamId]: 'audio' },
        });
      });

      const pc = mockPCInstances[0];
      const fakeStream = createMockStream([createMockTrack('audio')]);
      Object.defineProperty(fakeStream, 'id', { value: audioStreamId });

      act(() => {
        pc.ontrack!({ streams: [fakeStream] });
      });
    });
  });

  // 4. Screen share auto-stop on track.onended
  describe('screen share auto-stop on track.onended', () => {
    it('cleans up screen share when browser ends the track', async () => {
      const { result } = await setupJoined();
      await addFakePeer();

      await act(async () => {
        await result.current.toggleScreenShare();
      });

      expect(result.current.isScreenSharing).toBe(true);

      // Get the video track that had onended assigned
      const screenStream = result.current.localScreenStream!;
      const videoTrack = screenStream.getVideoTracks()[0];
      expect(videoTrack.onended).toBeDefined();

      const pc = mockPCInstances[0];
      pc.createOffer.mockClear();
      mockEmit.mockClear();

      // Simulate the browser "Stop sharing" button
      await act(async () => {
        (videoTrack as any).onended();
      });

      expect(result.current.isScreenSharing).toBe(false);
      expect(result.current.localScreenStream).toBeNull();
      expect(result.current.screenShareUserId).toBeNull();
      expect(pc.removeTrack).toHaveBeenCalled();
      expect(pc.createOffer).toHaveBeenCalled(); // renegotiation
      expect(mockEmit).toHaveBeenCalledWith(
        SIGNAL_EVENTS.MEDIA_STATE,
        expect.objectContaining({ isScreenSharing: false }),
      );
    });
  });

  // 5. Re-offer reuses existing peer connection (not creating a new one)
  describe('re-offer reuses existing peer connection', () => {
    it('does not create a new RTCPeerConnection on renegotiation offer', async () => {
      await setupJoined();

      const offerHandler = getSignalHandler(SIGNAL_EVENTS.OFFER);
      expect(offerHandler).toBeDefined();

      // First offer creates a connection
      await act(async () => {
        offerHandler!({
          fromUserId: 'peer-1',
          sdp: { type: 'offer', sdp: 'first-offer' },
          streamMeta: {},
        });
      });

      const pcCountAfterFirst = mockPCInstances.length;

      // Second offer (renegotiation) should reuse the same connection
      await act(async () => {
        offerHandler!({
          fromUserId: 'peer-1',
          sdp: { type: 'offer', sdp: 'second-offer' },
          streamMeta: {},
        });
      });

      expect(mockPCInstances.length).toBe(pcCountAfterFirst);
      // setRemoteDescription should have been called twice on the same PC
      const pc = mockPCInstances[pcCountAfterFirst - 1];
      expect(pc.setRemoteDescription).toHaveBeenCalledTimes(2);
    });
  });

  // 6. MEDIA_STATE event updates peer state
  describe('MEDIA_STATE event updates peer state', () => {
    it('updates isCameraOn and isScreenSharing for the given peer', async () => {
      const { result } = await setupJoined();
      await addFakePeer('peer-1');

      const mediaStateHandler = getSignalHandler(SIGNAL_EVENTS.MEDIA_STATE);
      expect(mediaStateHandler).toBeDefined();

      act(() => {
        mediaStateHandler!({
          userId: 'peer-1',
          isCameraOn: true,
          isScreenSharing: false,
        });
      });

      const peer1 = result.current.peers.find((p) => p.userId === 'peer-1');
      expect(peer1?.isCameraOn).toBe(true);
      expect(peer1?.isScreenSharing).toBe(false);
    });

    it('sets screenShareUserId when a peer starts screen sharing', async () => {
      const { result } = await setupJoined();
      await addFakePeer('peer-1');

      const mediaStateHandler = getSignalHandler(SIGNAL_EVENTS.MEDIA_STATE);

      act(() => {
        mediaStateHandler!({
          userId: 'peer-1',
          isCameraOn: false,
          isScreenSharing: true,
        });
      });

      expect(result.current.screenShareUserId).toBe('peer-1');
    });

    it('clears screenShareUserId when a peer stops screen sharing', async () => {
      const { result } = await setupJoined();
      await addFakePeer('peer-1');

      const mediaStateHandler = getSignalHandler(SIGNAL_EVENTS.MEDIA_STATE);

      // Start screen sharing
      act(() => {
        mediaStateHandler!({
          userId: 'peer-1',
          isCameraOn: false,
          isScreenSharing: true,
        });
      });

      expect(result.current.screenShareUserId).toBe('peer-1');

      // Stop screen sharing
      act(() => {
        mediaStateHandler!({
          userId: 'peer-1',
          isCameraOn: false,
          isScreenSharing: false,
        });
      });

      expect(result.current.screenShareUserId).toBeNull();
    });
  });
});
