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

interface PeerConnection {
  userId: string;
  displayName: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
  isMuted: boolean;
}

export function useWebRTC(roomId: string | null) {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const peerConnections = useRef<Map<string, PeerConnection>>(new Map());
  const { emit, on } = useWebSocket(SIGNALING_NAMESPACE);
  const localStreamRef = useRef<MediaStream | null>(null);

  const createPeerConnection = useCallback(
    (userId: string, displayName: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // Add local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
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
        if (peer) {
          peer.stream = event.streams[0];
          setPeers((prev) => [...prev]); // trigger re-render
        }
      };

      peerConnections.current.set(userId, {
        userId,
        displayName,
        connection: pc,
        isMuted: false,
      });

      return pc;
    },
    [roomId, emit],
  );

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
    setPeers([]);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
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
      for (const peer of data.peers) {
        const pc = createPeerConnection(peer.userId, peer.displayName);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        emit(SIGNAL_EVENTS.OFFER, {
          roomId,
          targetUserId: peer.userId,
          sdp: pc.localDescription,
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
      setPeers((prev) => prev.filter((p) => p.userId !== data.userId));
    });

    const unsubOffer = on(SIGNAL_EVENTS.OFFER, async (data: any) => {
      const pc = createPeerConnection(data.fromUserId, data.fromUserId);
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      emit(SIGNAL_EVENTS.ANSWER, {
        roomId,
        targetUserId: data.fromUserId,
        sdp: pc.localDescription,
      });
    });

    const unsubAnswer = on(SIGNAL_EVENTS.ANSWER, async (data: any) => {
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

    return () => {
      unsubPeers();
      unsubJoined();
      unsubLeft();
      unsubOffer();
      unsubAnswer();
      unsubIce();
      unsubMute();
    };
  }, [roomId, on, emit, createPeerConnection]);

  return {
    peers,
    isMuted,
    localStream,
    peerConnections: peerConnections.current,
    joinRoom,
    leaveRoom,
    toggleMute,
  };
}
