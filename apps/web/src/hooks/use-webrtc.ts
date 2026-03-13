'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from './use-websocket';
import { SIGNALING_NAMESPACE, SIGNAL_EVENTS } from '@nestlyx/shared';
import type { PeerInfo } from '@nestlyx/shared';

const ICE_SERVERS = (() => {
  try {
    const env = process.env.NEXT_PUBLIC_ICE_SERVERS;
    return env ? JSON.parse(env) : [{ urls: 'stun:stun.l.google.com:19302' }];
  } catch {
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
})();

export interface PeerConnection {
  userId: string;
  displayName: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
  videoStream?: MediaStream;
  screenStream?: MediaStream;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
}

export function useWebRTC(roomId: string | null) {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [screenShareUserId, setScreenShareUserId] = useState<string | null>(null);

  const peerConnections = useRef<Map<string, PeerConnection>>(new Map());
  const { emit, on } = useWebSocket(SIGNALING_NAMESPACE);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  // Refs to avoid stale closures in onended and toggle callbacks
  const isCameraOnRef = useRef(false);
  const isScreenSharingRef = useRef(false);
  const peersRef = useRef<PeerInfo[]>([]);
  // Store streamMeta received from peers for ontrack routing
  const peerStreamMeta = useRef<Map<string, Record<string, string>>>(new Map());

  // Keep peersRef in sync with state
  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  const buildStreamMeta = useCallback((): Record<string, string> => {
    const meta: Record<string, string> = {};
    if (localStreamRef.current) {
      meta[localStreamRef.current.id] = 'audio';
    }
    if (localVideoStreamRef.current) {
      meta[localVideoStreamRef.current.id] = 'camera';
    }
    if (localScreenStreamRef.current) {
      meta[localScreenStreamRef.current.id] = 'screen';
    }
    return meta;
  }, []);

  const createPeerConnection = useCallback(
    (userId: string, displayName: string): RTCPeerConnection => {
      // Reuse existing connection if one exists (for renegotiation)
      const existing = peerConnections.current.get(userId);
      if (existing) {
        return existing.connection;
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // Add local audio tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // Add local video tracks if camera is on
      if (localVideoStreamRef.current) {
        localVideoStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localVideoStreamRef.current!);
        });
      }

      // Add local screen tracks if screen sharing
      if (localScreenStreamRef.current) {
        localScreenStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localScreenStreamRef.current!);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          emit(SIGNAL_EVENTS.ICE_CANDIDATE, {
            roomId,
            targetUserId: userId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (event) => {
        const peer = peerConnections.current.get(userId);
        if (!peer) return;

        const streamId = event.streams[0]?.id;
        const meta = peerStreamMeta.current.get(userId);
        const streamType = meta?.[streamId];

        if (streamType === 'camera') {
          peer.videoStream = event.streams[0];
        } else if (streamType === 'screen') {
          peer.screenStream = event.streams[0];
        } else {
          // Default: audio stream (or unknown — assign to audio stream)
          peer.stream = event.streams[0];
        }

        setPeers((prev) => [...prev]); // trigger re-render
      };

      peerConnections.current.set(userId, {
        userId,
        displayName,
        connection: pc,
        isMuted: false,
        isCameraOn: false,
        isScreenSharing: false,
      });

      return pc;
    },
    [roomId, emit],
  );

  const renegotiateAll = useCallback(async () => {
    const meta = buildStreamMeta();
    for (const [userId, peer] of peerConnections.current.entries()) {
      try {
        const offer = await peer.connection.createOffer();
        await peer.connection.setLocalDescription(offer);
        emit(SIGNAL_EVENTS.OFFER, {
          roomId,
          targetUserId: userId,
          sdp: peer.connection.localDescription,
          streamMeta: meta,
        });
      } catch (err) {
        console.error(`Renegotiation failed for peer ${userId}:`, err);
      }
    }
  }, [roomId, emit, buildStreamMeta]);

  const toggleCamera = useCallback(async () => {
    if (!roomId) return;

    if (localVideoStreamRef.current) {
      // Turn off camera
      const stream = localVideoStreamRef.current;

      // Remove tracks from all peers
      for (const [, peer] of peerConnections.current.entries()) {
        const senders = peer.connection.getSenders();
        for (const sender of senders) {
          if (sender.track && stream.getTracks().includes(sender.track)) {
            peer.connection.removeTrack(sender);
          }
        }
      }

      stream.getTracks().forEach((t) => t.stop());
      localVideoStreamRef.current = null;
      setLocalVideoStream(null);
      setIsCameraOn(false);
      isCameraOnRef.current = false;

      await renegotiateAll();
      emit(SIGNAL_EVENTS.MEDIA_STATE, {
        roomId,
        isCameraOn: false,
        isScreenSharing: isScreenSharingRef.current,
      });
    } else {
      // Turn on camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        localVideoStreamRef.current = stream;
        setLocalVideoStream(stream);
        setIsCameraOn(true);
        isCameraOnRef.current = true;

        // Add tracks to all peers
        for (const [, peer] of peerConnections.current.entries()) {
          stream.getTracks().forEach((track) => {
            peer.connection.addTrack(track, stream);
          });
        }

        await renegotiateAll();
        emit(SIGNAL_EVENTS.MEDIA_STATE, {
          roomId,
          isCameraOn: true,
          isScreenSharing: isScreenSharingRef.current,
        });
      } catch (err) {
        console.error('Failed to get camera:', err);
      }
    }
  }, [roomId, emit, renegotiateAll]);

  const toggleScreenShare = useCallback(async () => {
    if (!roomId) return;

    if (localScreenStreamRef.current) {
      // Stop screen share
      const stream = localScreenStreamRef.current;

      for (const [, peer] of peerConnections.current.entries()) {
        const senders = peer.connection.getSenders();
        for (const sender of senders) {
          if (sender.track && stream.getTracks().includes(sender.track)) {
            peer.connection.removeTrack(sender);
          }
        }
      }

      stream.getTracks().forEach((t) => t.stop());
      localScreenStreamRef.current = null;
      setLocalScreenStream(null);
      setIsScreenSharing(false);
      isScreenSharingRef.current = false;
      setScreenShareUserId(null);

      await renegotiateAll();
      emit(SIGNAL_EVENTS.MEDIA_STATE, {
        roomId,
        isCameraOn: isCameraOnRef.current,
        isScreenSharing: false,
      });
    } else {
      // Start screen share
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        localScreenStreamRef.current = stream;
        setLocalScreenStream(stream);
        setIsScreenSharing(true);
        isScreenSharingRef.current = true;
        setScreenShareUserId('self');

        // Add tracks to all peers
        for (const [, peer] of peerConnections.current.entries()) {
          stream.getTracks().forEach((track) => {
            peer.connection.addTrack(track, stream);
          });
        }

        // Listen for browser "Stop sharing" button
        stream.getVideoTracks()[0].onended = async () => {
          localScreenStreamRef.current = null;
          setLocalScreenStream(null);
          setIsScreenSharing(false);
          isScreenSharingRef.current = false;
          setScreenShareUserId(null);

          // Remove tracks from all peers
          for (const [, peer] of peerConnections.current.entries()) {
            const senders = peer.connection.getSenders();
            for (const sender of senders) {
              if (sender.track && stream.getTracks().includes(sender.track)) {
                peer.connection.removeTrack(sender);
              }
            }
          }

          await renegotiateAll();
          emit(SIGNAL_EVENTS.MEDIA_STATE, {
            roomId,
            isCameraOn: isCameraOnRef.current,
            isScreenSharing: false,
          });
        };

        await renegotiateAll();
        emit(SIGNAL_EVENTS.MEDIA_STATE, {
          roomId,
          isCameraOn: isCameraOnRef.current,
          isScreenSharing: true,
        });
      } catch (err) {
        // User cancelled the screen share picker
        console.error('Failed to get screen share:', err);
      }
    }
  }, [roomId, emit, renegotiateAll]);

  const joinRoom = useCallback(async () => {
    if (!roomId) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
      emit(SIGNAL_EVENTS.JOIN_ROOM, { roomId });
    } catch (err) {
      console.error('Failed to get audio:', err);
    }
  }, [roomId, emit]);

  const leaveRoom = useCallback(() => {
    emit(SIGNAL_EVENTS.LEAVE_ROOM, { roomId });

    peerConnections.current.forEach((peer) => {
      peer.connection.close();
    });
    peerConnections.current.clear();
    peerStreamMeta.current.clear();
    setPeers([]);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    if (localVideoStreamRef.current) {
      localVideoStreamRef.current.getTracks().forEach((t) => t.stop());
      localVideoStreamRef.current = null;
      setLocalVideoStream(null);
    }
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((t) => t.stop());
      localScreenStreamRef.current = null;
      setLocalScreenStream(null);
    }

    setIsCameraOn(false);
    isCameraOnRef.current = false;
    setIsScreenSharing(false);
    isScreenSharingRef.current = false;
    setScreenShareUserId(null);
  }, [roomId, emit]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const newMuted = !audioTrack.enabled;
        setIsMuted(newMuted);
        emit(SIGNAL_EVENTS.MUTE_TOGGLE, { roomId, isMuted: newMuted });
      }
    }
  }, [roomId, emit]);

  useEffect(() => {
    if (!roomId) return;

    // When we get the list of existing peers, create offers to each
    const unsubPeers = on(SIGNAL_EVENTS.ROOM_PEERS, async (data: any) => {
      setPeers(data.peers);

      // Track who is screen sharing
      for (const peer of data.peers) {
        if (peer.isScreenSharing) {
          setScreenShareUserId(peer.userId);
        }
      }

      const meta = buildStreamMeta();
      for (const peer of data.peers) {
        const pc = createPeerConnection(peer.userId, peer.displayName);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        emit(SIGNAL_EVENTS.OFFER, {
          roomId,
          targetUserId: peer.userId,
          sdp: pc.localDescription,
          streamMeta: meta,
        });
      }
    });

    const unsubJoined = on(SIGNAL_EVENTS.PEER_JOINED, (data: any) => {
      setPeers((prev) => [...prev, data.peer]);
    });

    const unsubLeft = on(SIGNAL_EVENTS.PEER_LEFT, (data: any) => {
      const peer = peerConnections.current.get(data.userId);
      if (peer) {
        peer.connection.close();
        peerConnections.current.delete(data.userId);
      }
      peerStreamMeta.current.delete(data.userId);
      setPeers((prev) => prev.filter((p) => p.userId !== data.userId));
    });

    const unsubOffer = on(SIGNAL_EVENTS.OFFER, async (data: any) => {
      // Store stream meta for ontrack routing
      if (data.streamMeta) {
        peerStreamMeta.current.set(data.fromUserId, data.streamMeta);
      }

      // Reuse existing connection for renegotiation
      const existingPeer = peerConnections.current.get(data.fromUserId);
      let pc: RTCPeerConnection;
      if (existingPeer) {
        pc = existingPeer.connection;
      } else {
        // Look up displayName from peers ref (set by PEER_JOINED)
        const peerInfo = peersRef.current.find((p) => p.userId === data.fromUserId);
        const displayName = peerInfo?.displayName ?? data.fromUserId;
        pc = createPeerConnection(data.fromUserId, displayName);
      }

      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      emit(SIGNAL_EVENTS.ANSWER, {
        roomId,
        targetUserId: data.fromUserId,
        sdp: pc.localDescription,
        streamMeta: buildStreamMeta(),
      });
    });

    const unsubAnswer = on(SIGNAL_EVENTS.ANSWER, async (data: any) => {
      if (data.streamMeta) {
        peerStreamMeta.current.set(data.fromUserId, data.streamMeta);
      }

      const peer = peerConnections.current.get(data.fromUserId);
      if (peer) {
        await peer.connection.setRemoteDescription(
          new RTCSessionDescription(data.sdp),
        );
      }
    });

    const unsubIce = on(SIGNAL_EVENTS.ICE_CANDIDATE, async (data: any) => {
      const peer = peerConnections.current.get(data.fromUserId);
      if (peer) {
        await peer.connection.addIceCandidate(
          new RTCIceCandidate(data.candidate),
        );
      }
    });

    const unsubMute = on(SIGNAL_EVENTS.MUTE_TOGGLE, (data: any) => {
      const peer = peerConnections.current.get(data.userId);
      if (peer) peer.isMuted = data.isMuted;
      setPeers((prev) =>
        prev.map((p) =>
          p.userId === data.userId ? { ...p, isMuted: data.isMuted } : p,
        ),
      );
    });

    const unsubMediaState = on(SIGNAL_EVENTS.MEDIA_STATE, (data: any) => {
      const peer = peerConnections.current.get(data.userId);
      if (peer) {
        peer.isCameraOn = data.isCameraOn;
        peer.isScreenSharing = data.isScreenSharing;
      }

      setPeers((prev) =>
        prev.map((p) =>
          p.userId === data.userId
            ? { ...p, isCameraOn: data.isCameraOn, isScreenSharing: data.isScreenSharing }
            : p,
        ),
      );

      // Track screen share user
      if (data.isScreenSharing) {
        setScreenShareUserId(data.userId);
      } else {
        setScreenShareUserId((prev) => (prev === data.userId ? null : prev));
      }
    });

    return () => {
      unsubPeers();
      unsubJoined();
      unsubLeft();
      unsubOffer();
      unsubAnswer();
      unsubIce();
      unsubMute();
      unsubMediaState();
    };
  }, [roomId, on, emit, createPeerConnection, buildStreamMeta]);

  return {
    peers,
    isMuted,
    isCameraOn,
    isScreenSharing,
    localStream,
    localVideoStream,
    localScreenStream,
    screenShareUserId,
    peerConnections: peerConnections.current,
    joinRoom,
    leaveRoom,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
  };
}
