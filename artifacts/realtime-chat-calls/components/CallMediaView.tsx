import React from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import type { CallStream } from '@/services/call';

export function CallMediaView({
  stream,
  style,
  mirror = false,
}: {
  stream: CallStream;
  style: StyleProp<ViewStyle>;
  mirror?: boolean;
}) {
  if (Platform.OS !== 'web') {
    const { RTCView } = require('react-native-webrtc') as typeof import('react-native-webrtc');
    return <RTCView streamURL={stream.toURL()} style={style} objectFit="cover" mirror={mirror} />;
  }
  return <View style={style} />;
}