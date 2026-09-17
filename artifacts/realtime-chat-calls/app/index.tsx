import React, { useEffect, useMemo, useRef, useState } from 'react';
import { sendCallNotification, sendMessageNotification } from '@workspace/api-client-react';
import {
  Alert,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useColors } from '@/hooks/useColors';
import { CallMediaView } from '@/components/CallMediaView';
import {
  ChatMessage,
  getFirebaseSetupLabel,
  isFirebaseConfigured,
  sendRoomMessage,
  subscribeToRoom,
} from '@/services/firebase';
import {
  CallRole,
  CallSession,
  CallMode,
  CallStream,
  createCallSession,
  subscribeToIncomingCalls,
} from '@/services/call';
import { decryptJson, encryptJson } from '@/services/crypto';
import { enablePushNotifications } from '@/services/notifications';

type Person = {
  id: string;
  name: string;
  initials: string;
  color: string;
  status: string;
  lastSeen?: string;
};

type Thread = Person & {
  preview: string;
  time: string;
  unread?: number;
  messages: ChatMessage[];
};

type PendingMessage = {
  roomId: string;
  recipientUserId: string;
  message: ChatMessage;
};

const ME = 'me';
const roomIdFor = (personId: string) => `demo-room-${personId}`;

const PEOPLE: Person[] = [
  {
    id: 'maya',
    name: 'Maya Chen',
    initials: 'MC',
    color: '#E7A074',
    status: 'Active now',
  },
  {
    id: 'jonas',
    name: 'Jonas Reed',
    initials: 'JR',
    color: '#8C9BE8',
    status: 'Active 8m ago',
    lastSeen: '8m',
  },
  {
    id: 'alina',
    name: 'Alina Park',
    initials: 'AP',
    color: '#79BFA6',
    status: 'Active 22m ago',
    lastSeen: '22m',
  },
  {
    id: 'noah',
    name: 'Noah Williams',
    initials: 'NW',
    color: '#B58CD4',
    status: 'Active yesterday',
    lastSeen: 'yesterday',
  },
];

const INITIAL_MESSAGES: Record<string, ChatMessage[]> = {
  maya: [
    {
      id: 'maya-1',
      text: 'The new shots are ready. I think we finally found the right rhythm.',
      senderId: 'maya',
      createdAt: Date.now() - 1000 * 60 * 12,
    },
    {
      id: 'maya-2',
      text: 'They feel great. Sending a quick voice note now.',
      senderId: ME,
      createdAt: Date.now() - 1000 * 60 * 9,
    },
    {
      id: 'maya-3',
      text: 'Perfect. Let’s talk through the last two when you have a minute.',
      senderId: 'maya',
      createdAt: Date.now() - 1000 * 60 * 7,
    },
  ],
  jonas: [
    {
      id: 'jonas-1',
      text: 'Are we still on for the launch sync tomorrow?',
      senderId: 'jonas',
      createdAt: Date.now() - 1000 * 60 * 55,
    },
  ],
  alina: [
    {
      id: 'alina-1',
      text: 'I left the notes in the shared folder.',
      senderId: 'alina',
      createdAt: Date.now() - 1000 * 60 * 90,
    },
  ],
  noah: [
    {
      id: 'noah-1',
      text: 'That sounds like a plan.',
      senderId: 'noah',
      createdAt: Date.now() - 1000 * 60 * 60 * 20,
    },
  ],
};

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

function Avatar({
  person,
  size = 52,
  online = false,
}: {
  person: Person;
  size?: number;
  online?: boolean;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: person.color },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.31 }]}>{person.initials}</Text>
      {online ? <View style={[styles.onlineDot, { borderColor: colors.background }]} /> : null}
    </View>
  );
}

function IconButton({
  icon,
  onPress,
  backgroundColor,
  color,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  backgroundColor: string;
  color: string;
  label: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      testID={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor, opacity: pressed ? 0.72 : 1 },
      ]}
    >
      <Ionicons name={icon} size={19} color={color} />
    </Pressable>
  );
}

function OfflineBanner() {
  const colors = useColors();
  return (
    <View style={[styles.offlineBanner, { backgroundColor: colors.secondary }]}>
      <Ionicons name="cloud-offline-outline" size={16} color={colors.secondaryForeground} />
      <Text style={[styles.offlineText, { color: colors.secondaryForeground }]}>
        Waiting for network. Messages will send automatically.
      </Text>
    </View>
  );
}

function ConversationRow({
  thread,
  onPress,
}: {
  thread: Thread;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      testID={`conversation-${thread.id}`}
      style={({ pressed }) => [
        styles.conversationRow,
        { opacity: pressed ? 0.7 : 1, borderBottomColor: colors.border },
      ]}
    >
      <Avatar person={thread} online={thread.id === 'maya'} />
      <View style={styles.conversationBody}>
        <View style={styles.rowBetween}>
          <Text style={[styles.personName, { color: colors.foreground }]}>{thread.name}</Text>
          <Text style={[styles.messageTime, { color: colors.mutedForeground }]}>{thread.time}</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text
            numberOfLines={1}
            style={[
              styles.preview,
              { color: colors.mutedForeground, fontFamily: thread.unread ? 'Inter_600SemiBold' : 'Inter_400Regular' },
            ]}
          >
            {thread.preview}
          </Text>
          {thread.unread ? (
            <View style={[styles.unreadPill, { backgroundColor: colors.primary }]}>
              <Text style={styles.unreadText}>{thread.unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function CallSheet({
  person,
  mode,
  role,
  callId,
  callerId,
  calleeId,
  roomId,
  onClose,
}: {
  person: Person;
  mode: CallMode;
  role: CallRole;
  callId: string;
  callerId: string;
  calleeId: string;
  roomId: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [stream, setStream] = useState<CallStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<CallStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(mode === 'audio');
  const [seconds, setSeconds] = useState(0);
  const [callError, setCallError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'degraded'>('connecting');
  const sessionRef = useRef<CallSession | null>(null);

  useEffect(() => {
    let active = true;
    createCallSession({
      roomId,
      callId,
      role,
      mode,
      callerId,
      calleeId,
      onRemoteStream: setRemoteStream,
      onConnectionStateChange: (state) => {
        setConnectionState(state === 'connected' ? 'connected' : state === 'disconnected' || state === 'failed' ? 'degraded' : 'connecting');
      },
    })
      .then((session) => {
        if (active) {
          sessionRef.current = session;
          setStream(session.localStream);
        } else {
          session.dispose();
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setCallError(error instanceof Error ? error.message : 'Calling is unavailable right now.');
        }
      });
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => {
      active = false;
      clearInterval(timer);
      sessionRef.current?.dispose();
      sessionRef.current = null;
    };
  }, [callId, calleeId, callerId, mode, role, roomId]);

  const toggleMute = () => {
    stream?.getAudioTracks().forEach((track) => {
      track.enabled = isMuted;
    });
    setIsMuted((value) => !value);
  };

  const toggleCamera = () => {
    stream?.getVideoTracks().forEach((track) => {
      track.enabled = isCameraOff;
    });
    setIsCameraOff((value) => !value);
  };

  const finish = () => {
    sessionRef.current?.dispose();
    sessionRef.current = null;
    onClose();
  };

  const elapsed = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const callStatus =
    callError ??
    (connectionState === 'degraded'
      ? 'Weak connection · lowering video quality'
      : connectionState === 'connected'
        ? 'Connected securely'
        : 'Connecting securely…');

  return (
    <View style={[styles.callSheet, { backgroundColor: '#171A21', paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={styles.callTopBar}>
        <Pressable onPress={finish} style={styles.callBack}>
          <Ionicons name="chevron-down" size={23} color="#F7F8FA" />
        </Pressable>
        <View style={styles.callTopTitle}>
          <Text style={styles.callTitle}>{mode === 'video' ? 'Video call' : 'Audio call'}</Text>
          <Text style={styles.callTimer}>{elapsed}</Text>
        </View>
        <View style={styles.callSecure}>
          <Ionicons name="lock-closed" size={12} color="#D8F6C9" />
          <Text style={styles.secureText}>Private</Text>
        </View>
      </View>

      <View style={styles.callStage}>
        {remoteStream && mode === 'video' ? (
          <CallMediaView stream={remoteStream} style={styles.localVideo} />
        ) : (
          <View style={styles.callAvatarWrap}>
            <View style={styles.callAvatarRing}>
              <Avatar person={person} size={116} online />
            </View>
            <Text style={styles.callPerson}>{person.name}</Text>
            <Text style={styles.callStatus}>{callStatus}</Text>
          </View>
        )}
        {stream && mode === 'video' && !isCameraOff ? (
          <View style={styles.selfPreview}>
            <CallMediaView stream={stream} style={styles.selfPreviewVideo} mirror />
          </View>
        ) : null}
      </View>

      {callError || connectionState === 'degraded' ? (
        <View style={styles.callNotice}>
          <Ionicons
            name={callError ? 'information-circle-outline' : 'speedometer-outline'}
            size={17}
            color="#F7D9A4"
          />
          <Text style={styles.callNoticeText}>
            {callError ?? 'Low bandwidth mode is active. Video is using less data.'}
          </Text>
        </View>
      ) : null}

      <View style={[styles.callControls, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        <Pressable
          onPress={toggleMute}
          style={[styles.callControl, isMuted && { backgroundColor: '#F7F8FA' }]}
        >
          <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={22} color={isMuted ? '#171A21' : '#F7F8FA'} />
          <Text style={styles.callControlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
        </Pressable>
        <Pressable onPress={finish} style={[styles.callControl, styles.endCall]}>
          <Ionicons name="call" size={26} color="#FFFFFF" />
          <Text style={styles.callControlLabel}>End</Text>
        </Pressable>
        <Pressable
          onPress={toggleCamera}
          style={[styles.callControl, isCameraOff && { backgroundColor: '#F7F8FA' }]}
        >
          <Ionicons
            name={isCameraOff ? 'videocam-off' : 'videocam'}
            size={22}
            color={isCameraOff ? '#171A21' : '#F7F8FA'}
          />
          <Text style={styles.callControlLabel}>{isCameraOff ? 'Camera' : 'Video'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ChatView({
  person,
  messages,
  isOnline,
  onBack,
  onSend,
  onCall,
}: {
  person: Person;
  messages: ChatMessage[];
  isOnline: boolean | null;
  onBack: () => void;
  onSend: (text: string) => void;
  onCall: (mode: CallMode) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');

  const send = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setDraft('');
    Keyboard.dismiss();
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[styles.screen, { backgroundColor: colors.background }]}
      keyboardVerticalOffset={0}
    >
      <StatusBar style="light" />
      <View
        style={[
          styles.chatHeader,
          { paddingTop: insets.top + 8, borderBottomColor: colors.border, backgroundColor: colors.primaryDark },
        ]}
      >
        <Pressable accessibilityLabel="Back to inbox" onPress={onBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={25} color={colors.onPrimary} />
        </Pressable>
        <Avatar person={person} size={42} online={person.id === 'maya'} />
        <View style={styles.chatHeading}>
          <Text style={[styles.chatName, { color: colors.onPrimary }]}>{person.name}</Text>
          <Text style={[styles.chatPresence, { color: colors.accent }]}>{person.status}</Text>
        </View>
        <IconButton
          icon="videocam-outline"
          onPress={() => onCall('video')}
          backgroundColor={colors.headerSecondary}
          color={colors.onPrimary}
          label="Start video call"
        />
        <IconButton
          icon="call-outline"
          onPress={() => onCall('audio')}
          backgroundColor={colors.headerSecondary}
          color={colors.onPrimary}
          label="Start audio call"
        />
      </View>
      {isOnline === false ? <OfflineBanner /> : null}

      <FlatList
        inverted
        data={[...messages].reverse()}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        scrollEnabled={messages.length > 0}
        keyboardDismissMode="interactive"
        renderItem={({ item, index }) => {
          const mine = item.senderId === ME;
          const previous = [...messages].reverse()[index + 1];
          const sameSender = previous?.senderId === item.senderId;
          return (
            <View style={[styles.messageLine, mine ? styles.mineLine : styles.theirLine]}>
              {!mine && !sameSender ? <Avatar person={person} size={25} /> : <View style={styles.miniAvatarSpace} />}
              <View
                style={[
                  styles.messageBubble,
                  mine
                    ? { backgroundColor: colors.accent, borderBottomRightRadius: 6 }
                    : { backgroundColor: colors.card, borderBottomLeftRadius: 6 },
                ]}
              >
                <Text style={[styles.messageText, { color: colors.foreground }]}>
                  {item.text}
                </Text>
                <Text style={[styles.bubbleTime, { color: colors.mutedForeground }]}>
                  {formatTime(item.createdAt)}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyMessages}>
            <Ionicons name="chatbubble-ellipses-outline" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Start the conversation</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Send a message to {person.name.split(' ')[0]}.
            </Text>
          </View>
        }
      />

      <View
        style={[
          styles.composerWrap,
          { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        <Pressable accessibilityLabel="Add attachment" style={styles.composerIcon}>
          <Ionicons name="add-circle-outline" size={25} color={colors.mutedForeground} />
        </Pressable>
        <TextInput
          testID="message-input"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={send}
          placeholder="Write a message"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="send"
          multiline
          style={[styles.composerInput, { color: colors.foreground, backgroundColor: colors.card }]}
        />
        <Pressable
          accessibilityLabel="Send message"
          testID="send-message"
          onPress={send}
          style={({ pressed }) => [
            styles.sendButton,
            { backgroundColor: draft.trim() ? colors.primary : colors.secondary, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="arrow-up" size={20} color={draft.trim() ? colors.primaryForeground : colors.mutedForeground} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [call, setCall] = useState<{
    person: Person;
    mode: CallMode;
    role: CallRole;
    callId: string;
    callerId: string;
    calleeId: string;
    roomId: string;
  } | null>(null);
  const [messageMap, setMessageMap] = useState<Record<string, ChatMessage[]>>(INITIAL_MESSAGES);
  const [hydrated, setHydrated] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const flushingRef = useRef(false);
  const persistenceQueueRef = useRef(Promise.resolve());
  const currentUserId = process.env.EXPO_PUBLIC_USER_ID ?? ME;

  const enableNotifications = async () => {
    try {
      const result = await enablePushNotifications('demo-user');
      if (result.ok) {
        Alert.alert('Notifications enabled', 'Pulse will alert you about new messages and incoming calls.');
      } else if (result.reason === 'permission_denied') {
        Alert.alert('Notifications are off', 'Enable notifications for Pulse from your device settings.');
      } else {
        Alert.alert('Use a physical device', 'Push notifications are available in the iOS or Android build.');
      }
    } catch {
      Alert.alert('Could not enable notifications', 'Check your connection and try again.');
    }
  };

  useEffect(() => {
    NetInfo.fetch().then((state) => setIsOnline(state.isConnected !== false));
    return NetInfo.addEventListener((state) => setIsOnline(state.isConnected !== false));
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('pulse-messages')
      .then((value) => {
        if (value) {
          void decryptJson<Record<string, ChatMessage[]>>(value, INITIAL_MESSAGES).then(setMessageMap);
        }
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('pulse-pending-messages')
      .then((value) => {
        if (value) {
          void decryptJson<PendingMessage[]>(value, []).then(setPendingMessages);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    persistenceQueueRef.current = persistenceQueueRef.current
      .then(() => encryptJson(messageMap))
      .then((encrypted) => AsyncStorage.setItem('pulse-messages', encrypted))
      .catch(() => undefined);
  }, [hydrated, messageMap]);

  useEffect(() => {
    persistenceQueueRef.current = persistenceQueueRef.current
      .then(() => encryptJson(pendingMessages))
      .then((encrypted) => AsyncStorage.setItem('pulse-pending-messages', encrypted))
      .catch(() => undefined);
  }, [pendingMessages]);

  useEffect(() => {
    if (isOnline !== true || !isFirebaseConfigured || !pendingMessages.length || flushingRef.current) return;
    flushingRef.current = true;
    const queued = [...pendingMessages];
    const deliveredIds: string[] = [];

    void (async () => {
      for (const pending of queued) {
        const sent = await sendRoomMessage(pending.roomId, pending.message);
        if (!sent) break;
        deliveredIds.push(pending.message.id);
        const recipientUserId =
          pending.recipientUserId ?? pending.roomId.replace(/^demo-room-/, '');
        void sendMessageNotification({
          recipientUserId,
          senderName: 'Pulse',
          roomId: pending.roomId,
        }).catch(() => undefined);
      }
      if (deliveredIds.length) {
        setPendingMessages((current) =>
          current.filter((pending) => !deliveredIds.includes(pending.message.id)),
        );
      }
      flushingRef.current = false;
    })();
  }, [isOnline, pendingMessages]);

  const selectedPerson = PEOPLE.find((person) => person.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;
    const unsubscribe = subscribeToRoom(roomIdFor(selectedId), (remoteMessages) => {
      if (remoteMessages.length) {
        setMessageMap((current) => ({ ...current, [selectedId]: remoteMessages }));
      }
    });
    return () => unsubscribe?.();
  }, [selectedId]);

  useEffect(() => {
    if (!isFirebaseConfigured || call) return;
    const unsubscribes = PEOPLE.map((person) =>
      subscribeToIncomingCalls(roomIdFor(person.id), currentUserId, (incomingCall) => {
        const caller =
          PEOPLE.find((personEntry) => personEntry.id === incomingCall.callerId) ?? {
            id: incomingCall.callerId,
            name: incomingCall.callerId === ME ? 'Pulse caller' : incomingCall.callerId,
            initials: 'PC',
            color: '#8C9BE8',
            status: 'Calling now',
          };
        setCall({
          person: caller,
          mode: incomingCall.mode,
          role: 'callee',
          callId: incomingCall.id,
          callerId: incomingCall.callerId,
          calleeId: currentUserId,
          roomId: roomIdFor(person.id),
        });
      }),
    );
    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [call, currentUserId]);

  const threads = useMemo<Thread[]>(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return PEOPLE.map((person) => {
      const messages = messageMap[person.id] ?? [];
      const latest = messages[messages.length - 1];
      return {
        ...person,
        messages,
        preview: latest?.text ?? 'Start a new conversation',
        time: latest ? formatTime(latest.createdAt) : 'New',
        unread: person.id === 'maya' ? 2 : undefined,
      };
    }).filter((thread) => !normalizedSearch || thread.name.toLowerCase().includes(normalizedSearch));
  }, [messageMap, search]);

  const sendMessage = async (text: string) => {
    if (!selectedPerson) return;
    const roomId = roomIdFor(selectedPerson.id);
    const message: ChatMessage = {
      id: `${ME}-${Date.now()}`,
      text,
      senderId: ME,
      createdAt: Date.now(),
    };
    setMessageMap((current) => ({
      ...current,
      [selectedPerson.id]: [...(current[selectedPerson.id] ?? []), message],
    }));
    if (isFirebaseConfigured) {
      const sent = isOnline === true ? await sendRoomMessage(roomId, message) : false;
      if (!sent) {
        setPendingMessages((current) => [
          ...current.filter((pending) => pending.message.id !== message.id),
          { roomId, recipientUserId: selectedPerson.id, message },
        ]);
      } else {
        void sendMessageNotification({
          recipientUserId: selectedPerson.id,
          senderName: 'Pulse',
          roomId,
        }).catch(() => undefined);
      }
    }
  };

  const startCall = (mode: CallMode) => {
    if (!selectedPerson) return;
    const roomId = roomIdFor(selectedPerson.id);
    const callId = `${currentUserId}-call-${Date.now()}`;
    setCall({
      person: selectedPerson,
      mode,
      role: 'caller',
      callId,
      callerId: currentUserId,
      calleeId: selectedPerson.id,
      roomId,
    });
    void sendCallNotification({
      recipientUserId: selectedPerson.id,
      callerName: 'Pulse',
      mode,
      callId,
    }).catch(() => undefined);
  };

  if (call) {
    return (
      <CallSheet
        person={call.person}
        mode={call.mode}
        role={call.role}
        callId={call.callId}
        callerId={call.callerId}
        calleeId={call.calleeId}
        roomId={call.roomId}
        onClose={() => setCall(null)}
      />
    );
  }

  if (selectedPerson) {
    return (
      <ChatView
        person={selectedPerson}
        messages={messageMap[selectedPerson.id] ?? []}
        isOnline={isOnline}
        onBack={() => setSelectedId(null)}
        onSend={sendMessage}
        onCall={startCall}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <FlatList
        data={threads}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: 0, paddingBottom: Math.max(insets.bottom, 24) }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={[styles.homeHeader, { backgroundColor: colors.primaryDark, paddingTop: insets.top + 14 }]}>
              <View>
                <Text style={[styles.eyebrow, { color: colors.accent }]}>PULSE</Text>
                <Text style={[styles.greeting, { color: colors.onPrimary }]}>Chats</Text>
              </View>
              <View style={styles.headerActions}>
                <IconButton
                  icon="camera-outline"
                  onPress={() => Alert.alert('Camera', 'Camera sharing is ready for your conversations.')}
                  backgroundColor={colors.headerSecondary}
                  color={colors.onPrimary}
                  label="Open camera"
                />
                <IconButton
                  icon="ellipsis-vertical"
                  onPress={() => Alert.alert('More options', 'Settings and starred messages are available here.')}
                  backgroundColor={colors.headerSecondary}
                  color={colors.onPrimary}
                  label="More options"
                />
              </View>
            </View>

            <View style={[styles.connectionBanner, { backgroundColor: colors.card }]}>
              <View style={[styles.connectionIcon, { backgroundColor: isFirebaseConfigured ? colors.accent : '#F7D9A4' }]}>
                <Ionicons
                  name={isFirebaseConfigured ? 'radio-outline' : 'construct-outline'}
                  size={17}
                  color={isFirebaseConfigured ? colors.accentForeground : '#6E4A21'}
                />
              </View>
              <View style={styles.connectionCopy}>
                <Text style={[styles.connectionTitle, { color: colors.foreground }]}>{getFirebaseSetupLabel()}</Text>
                <Text style={[styles.connectionSub, { color: colors.mutedForeground }]}>
                  {isFirebaseConfigured ? 'Messages sync across your devices' : 'Add Firebase env values to enable live sync'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.mutedForeground} />
            </View>

            <View style={[styles.searchBar, { backgroundColor: colors.card }]}>
              <Ionicons name="search" size={19} color={colors.mutedForeground} />
              <TextInput
                testID="search-conversations"
                value={search}
                onChangeText={setSearch}
                placeholder="Search conversations"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.searchInput, { color: colors.foreground }]}
              />
              {search ? (
                <Pressable onPress={() => setSearch('')} accessibilityLabel="Clear search">
                  <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.sectionHeading}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Chats</Text>
              <Pressable onPress={() => Alert.alert('New message', 'Choose a person from your contacts to start chatting.')}>
                <Text style={[styles.newMessage, { color: colors.primary }]}>New chat</Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item }) => <ConversationRow thread={item} onPress={() => setSelectedId(item.id)} />}
        ListEmptyComponent={
          <View style={styles.noResults}>
            <Ionicons name="search-outline" size={30} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No matches</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Try a different name.</Text>
          </View>
        }
      />
      <View
        style={[
          styles.homeFooter,
          { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        <View style={styles.footerItem}>
          <Ionicons name="chatbubbles" size={22} color={colors.primary} />
          <Text style={[styles.footerLabel, { color: colors.primary }]}>Chats</Text>
        </View>
        <Pressable style={styles.footerItem} onPress={() => Alert.alert('Calls', 'Your recent calls will appear here.')}>
          <Ionicons name="call-outline" size={22} color={colors.mutedForeground} />
          <Text style={[styles.footerLabel, { color: colors.mutedForeground }]}>Calls</Text>
        </Pressable>
        <Pressable style={styles.footerItem} onPress={enableNotifications}>
          <Ionicons name="settings-outline" size={22} color={colors.mutedForeground} />
          <Text style={[styles.footerLabel, { color: colors.mutedForeground }]}>Settings</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  homeHeader: {
    paddingHorizontal: 22,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2.2, marginBottom: 4 },
  greeting: { fontSize: 24, fontFamily: 'Inter_600SemiBold', letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  profileAvatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#D8F6C9', alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { color: '#152014', fontFamily: 'Inter_700Bold', fontSize: 12 },
  connectionBanner: {
    marginHorizontal: 22,
    borderRadius: 12,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 14,
  },
  connectionIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  connectionCopy: { flex: 1 },
  connectionTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 3 },
  connectionSub: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  offlineBanner: { minHeight: 38, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8 },
  offlineText: { flex: 1, fontSize: 11, fontFamily: 'Inter_500Medium' },
  searchBar: { marginHorizontal: 22, borderRadius: 22, minHeight: 44, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', marginLeft: 9, paddingVertical: 11 },
  sectionHeading: { paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold', letterSpacing: -0.2 },
  newMessage: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  conversationRow: { marginHorizontal: 0, paddingHorizontal: 22, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', borderRadius: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E9EDEF' },
  conversationBody: { flex: 1, marginLeft: 13, gap: 5 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  avatarText: { color: '#101216', fontFamily: 'Inter_700Bold' },
  onlineDot: { position: 'absolute', right: -1, bottom: 1, width: 13, height: 13, borderRadius: 7, backgroundColor: '#8CD66C', borderWidth: 3, borderColor: '#101216' },
  personName: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  messageTime: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  preview: { flex: 1, fontSize: 13, lineHeight: 18, marginRight: 8 },
  unreadPill: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  unreadText: { fontSize: 10, color: '#101216', fontFamily: 'Inter_700Bold' },
  homeFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9, flexDirection: 'row', justifyContent: 'space-around' },
  footerItem: { minWidth: 70, alignItems: 'center', gap: 4 },
  footerLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  noResults: { alignItems: 'center', paddingTop: 55, gap: 6 },
  emptyMessages: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 170, gap: 7 },
  emptyTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  chatHeader: { paddingHorizontal: 9, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, gap: 7 },
  backButton: { width: 34, height: 42, justifyContent: 'center', alignItems: 'center' },
  chatHeading: { flex: 1, marginLeft: 2 },
  chatName: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 3 },
  chatPresence: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  messageList: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 },
  messageLine: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 9, gap: 7 },
  mineLine: { justifyContent: 'flex-end' },
  theirLine: { justifyContent: 'flex-start' },
  miniAvatarSpace: { width: 25 },
  messageBubble: { maxWidth: '79%', paddingHorizontal: 12, paddingTop: 9, paddingBottom: 6, borderRadius: 8 },
  messageText: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  bubbleTime: { fontSize: 9, fontFamily: 'Inter_500Medium', textAlign: 'right', marginTop: 4 },
  composerWrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingTop: 8, flexDirection: 'row', alignItems: 'flex-end', gap: 7 },
  composerIcon: { width: 35, height: 44, alignItems: 'center', justifyContent: 'center' },
  composerInput: { flex: 1, minHeight: 42, maxHeight: 110, borderRadius: 21, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 9, fontSize: 14, fontFamily: 'Inter_400Regular' },
  sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  callSheet: { flex: 1 },
  callTopBar: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  callBack: { width: 36, height: 36, justifyContent: 'center' },
  callTopTitle: { alignItems: 'center' },
  callTitle: { color: '#F7F8FA', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  callTimer: { color: '#9AA2B1', fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  callSecure: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  secureText: { color: '#D8F6C9', fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  callStage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  localVideo: StyleSheet.absoluteFill,
  callAvatarWrap: { alignItems: 'center' },
  callAvatarRing: { padding: 8, borderRadius: 72, borderWidth: 1, borderColor: '#3C434F' },
  callPerson: { color: '#F7F8FA', fontSize: 21, fontFamily: 'Inter_700Bold', marginTop: 23 },
  callStatus: { color: '#9AA2B1', fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 7 },
  selfPreview: { position: 'absolute', right: 18, top: 20, width: 101, height: 145, overflow: 'hidden', borderRadius: 17, borderWidth: 2, borderColor: '#4B515C' },
  selfPreviewVideo: { flex: 1 },
  callNotice: { marginHorizontal: 24, padding: 12, borderRadius: 14, backgroundColor: '#292B2B', flexDirection: 'row', gap: 8, alignItems: 'center' },
  callNoticeText: { flex: 1, color: '#F7D9A4', fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  callControls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 30, paddingTop: 18 },
  callControl: { width: 60, height: 60, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A2E37' },
  endCall: { backgroundColor: '#FF5D65', width: 66, height: 66, borderRadius: 24 },
  callControlLabel: { position: 'absolute', top: 66, color: '#9AA2B1', fontSize: 10, fontFamily: 'Inter_500Medium' },
});