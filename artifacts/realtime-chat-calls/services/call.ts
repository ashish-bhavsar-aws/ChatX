import { Platform } from 'react-native';
import { getRtcConfiguration } from './firebase';

export type CallMode = 'audio' | 'video';
export type CallTrack = { stop: () => void; enabled: boolean };
export type CallStream = {
  toURL: () => string;
  getTracks: () => CallTrack[];
  getAudioTracks: () => CallTrack[];
  getVideoTracks: () => CallTrack[];
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
        ? { facingMode: 'user', width: 720, height: 960, frameRate: 24 }
        : false,
  });
}

export function createPeerConnection(
  localStream: CallStream,
  onRemoteStream: (stream: CallStream) => void,
) {
  const webRtc = getWebRtcModule();
  if (!webRtc) return null;
  const peerConnection = new webRtc.RTCPeerConnection(getRtcConfiguration());
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track as never, localStream as never);
  });
  peerConnection.ontrack = (event: { streams: CallStream[] }) => {
    const [remoteStream] = event.streams;
    if (remoteStream) onRemoteStream(remoteStream);
  };
  return peerConnection;
}

export function stopLocalCallStream(stream: CallStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}