import { Platform } from 'react-native';
import {
  child,
  equalTo,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  set,
  update,
  type DatabaseReference,
  type Unsubscribe,
} from 'firebase/database';
import { getFirebaseDatabase, getRtcConfiguration } from './firebase';

export type CallMode = 'audio' | 'video';
export type CallTrack = { stop: () => void; enabled: boolean };
export type CallStream = {
  toURL: () => string;
  getTracks: () => CallTrack[];
  getAudioTracks: () => CallTrack[];
  getVideoTracks: () => CallTrack[];
};
export type CallRole = 'caller' | 'callee';
export type CallSignal = {
  id: string;
  callerId: string;
  calleeId: string;
  mode: CallMode;
  status: 'ringing' | 'connected';
};
type PeerConnection = {
  addTrack: (track: never, stream: never) => void;
  addIceCandidate: (candidate: unknown) => Promise<void>;
  createOffer: () => Promise<unknown>;
  createAnswer: () => Promise<unknown>;
  setLocalDescription: (description: unknown) => Promise<void>;
  setRemoteDescription: (description: unknown) => Promise<void>;
  close: () => void;
  getSenders: () => Array<{
    track?: { kind?: string };
    getParameters: () => RtpSenderParameters;
    setParameters: (parameters: RtpSenderParameters) => Promise<void>;
  }>;
  ontrack: ((event: { streams: CallStream[] }) => void) | null;
  onicecandidate: ((event: { candidate?: { toJSON?: () => unknown } | null }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  connectionState?: string;
};
type RtpSenderParameters = {
  encodings?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

function getWebRtcModule() {
  if (Platform.OS === 'web') return null;
  return require('react-native-webrtc') as typeof import('react-native-webrtc');
}

export async function createLocalCallStream(mode: CallMode): Promise<CallStream> {
  const webRtc = getWebRtcModule();
  if (!webRtc) {
    throw new Error('Native calling is available in the iOS and Android builds.');
  }
  return webRtc.mediaDevices.getUserMedia({
    audio: true,
    video:
      mode === 'video'
        ? { facingMode: 'user', width: 480, height: 640, frameRate: 15 }
        : false,
  });
}

export function createPeerConnection(
  localStream: CallStream,
  onRemoteStream: (stream: CallStream) => void,
) {
  const webRtc = getWebRtcModule();
  if (!webRtc) return null;
  const peerConnection = new webRtc.RTCPeerConnection(getRtcConfiguration()) as unknown as PeerConnection;
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track as never, localStream as never);
  });
  setVideoQuality(peerConnection, 320_000, 15, 1);
  peerConnection.ontrack = (event: { streams: CallStream[] }) => {
    const [remoteStream] = event.streams;
    if (remoteStream) onRemoteStream(remoteStream);
  };
  return peerConnection;
}

function setVideoQuality(
  peerConnection: PeerConnection,
  maxBitrate: number,
  maxFramerate: number,
  scaleResolutionDownBy: number,
) {
  peerConnection.getSenders().forEach((sender) => {
    if (sender.track?.kind !== 'video') return;
    const parameters = sender.getParameters();
    const encodings = parameters.encodings?.length ? parameters.encodings : [{}];
    parameters.encodings = encodings.map((encoding) => ({
      ...encoding,
      maxBitrate,
      maxFramerate,
      scaleResolutionDownBy,
    }));
    void sender.setParameters(parameters).catch(() => undefined);
  });
}

function serialiseDescription(description: unknown) {
  if (!description || typeof description !== 'object') return description;
  const value = description as { toJSON?: () => unknown };
  return value.toJSON ? value.toJSON() : description;
}

function watchCandidates(
  peerConnection: PeerConnection,
  candidatesRef: DatabaseReference,
  seen: Set<string>,
) {
  return onValue(
    candidatesRef,
    (snapshot) => {
      const additions: Promise<void>[] = [];
      snapshot.forEach((child) => {
        if (child.key && seen.has(child.key)) return;
        if (child.key) seen.add(child.key);
        additions.push(peerConnection.addIceCandidate(child.val()));
      });
      void Promise.allSettled(additions);
    },
    () => undefined,
  );
}

export type CallSession = {
  localStream: CallStream;
  dispose: () => void;
};

export async function createCallSession(input: {
  roomId: string;
  callId: string;
  role: CallRole;
  mode: CallMode;
  callerId: string;
  calleeId: string;
  onRemoteStream: (stream: CallStream) => void;
  onConnectionStateChange?: (state: string) => void;
}): Promise<CallSession> {
  const database = getFirebaseDatabase();
  if (!database) throw new Error('Firebase calling is not configured.');
  const localStream = await createLocalCallStream(input.mode);
  const peerConnection = createPeerConnection(localStream, input.onRemoteStream);
  if (!peerConnection) {
    stopLocalCallStream(localStream);
    throw new Error('Native calling is available in the iOS and Android builds.');
  }

  const callRef = ref(database, `rooms/${input.roomId}/calls/${input.callId}`);
  const callerCandidatesRef = child(callRef, 'callerCandidates');
  const calleeCandidatesRef = child(callRef, 'calleeCandidates');
  const remoteCandidates = new Set<string>();
  let disposed = false;
  let answerApplied = false;
  let offerHandled = false;
  const candidateUnsubscribes: Unsubscribe[] = [];

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState ?? 'connecting';
    input.onConnectionStateChange?.(state);
    if (state === 'disconnected' || state === 'failed') {
      setVideoQuality(peerConnection, 180_000, 10, 1.5);
    } else if (state === 'connected') {
      setVideoQuality(peerConnection, 320_000, 15, 1);
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (!event.candidate || disposed) return;
    const candidateRef = push(input.role === 'caller' ? callerCandidatesRef : calleeCandidatesRef);
    void set(candidateRef, serialiseDescription(event.candidate)).catch(() => undefined);
  };

  const signalUnsubscribe: Unsubscribe = onValue(
    callRef,
    (snapshot) => {
      const signal = snapshot.val() as
        | { offer?: unknown; answer?: unknown }
        | null;
      if (!signal || disposed) return;
      void (async () => {
        if (input.role === 'caller') {
          if (signal.answer && !answerApplied) {
            answerApplied = true;
            await peerConnection.setRemoteDescription(signal.answer);
            candidateUnsubscribes.push(
              watchCandidates(peerConnection, calleeCandidatesRef, remoteCandidates),
            );
          }
          return;
        }
        if (signal.offer && !offerHandled) {
          offerHandled = true;
          await peerConnection.setRemoteDescription(signal.offer);
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          await update(callRef, { answer: serialiseDescription(answer), status: 'connected' });
          candidateUnsubscribes.push(
            watchCandidates(peerConnection, callerCandidatesRef, remoteCandidates),
          );
        }
      })().catch(() => undefined);
    },
    () => undefined,
  );

  if (input.role === 'caller') {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await set(callRef, {
      callerId: input.callerId,
      calleeId: input.calleeId,
      mode: input.mode,
      status: 'ringing',
      offer: serialiseDescription(offer),
      createdAt: Date.now(),
    });
  }

  return {
    localStream,
    dispose: () => {
      disposed = true;
      signalUnsubscribe();
      candidateUnsubscribes.forEach((unsubscribe) => unsubscribe());
      peerConnection.close();
      stopLocalCallStream(localStream);
      void set(callRef, null).catch(() => undefined);
    },
  };
}

export function subscribeToIncomingCalls(
  roomId: string,
  calleeId: string,
  onCall: (call: CallSignal) => void,
): Unsubscribe | null {
  const database = getFirebaseDatabase();
  if (!database) return null;
  const callsQuery = query(
    ref(database, `rooms/${roomId}/calls`),
    orderByChild('calleeId'),
    equalTo(calleeId),
  );
  return onValue(
    callsQuery,
    (snapshot) => {
      snapshot.forEach((child) => {
        const value = child.val() as Partial<CallSignal> | null;
        if (
          value?.callerId &&
          value.calleeId === calleeId &&
          (value.mode === 'audio' || value.mode === 'video') &&
          value.status === 'ringing'
        ) {
          onCall({
            id: child.key ?? `${Date.now()}`,
            callerId: value.callerId,
            calleeId,
            mode: value.mode,
            status: value.status,
          });
        }
      });
    },
    () => undefined,
  );
}

export function stopLocalCallStream(stream: CallStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}