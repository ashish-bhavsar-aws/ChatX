import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getDatabase,
  limitToLast,
  onValue,
  push,
  query,
  ref,
  set,
  type Unsubscribe,
} from 'firebase/database';

export type ChatMessage = {
  id: string;
  text: string;
  senderId: string;
  createdAt: number;
};

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

function getFirebaseDatabase() {
  if (!isFirebaseConfigured) return null;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getDatabase(app);
}

export function subscribeToRoom(
  roomId: string,
  onMessages: (messages: ChatMessage[]) => void,
): Unsubscribe | null {
  let database;
  try {
    database = getFirebaseDatabase();
  } catch {
    return null;
  }
  if (!database) return null;

  const messagesRef = query(ref(database, `rooms/${roomId}/messages`), limitToLast(80));
  return onValue(
    messagesRef,
    (snapshot) => {
      const messages: ChatMessage[] = [];
      snapshot.forEach((child) => {
        const value = child.val() as Omit<ChatMessage, 'id'>;
        messages.push({ ...value, id: child.key ?? `${value.createdAt}` });
      });
      onMessages(messages.sort((a, b) => a.createdAt - b.createdAt));
    },
    () => undefined,
  );
}

export async function sendRoomMessage(
  roomId: string,
  message: ChatMessage,
) {
  let database;
  try {
    database = getFirebaseDatabase();
  } catch {
    return false;
  }
  if (!database) return false;

  const messageRef = ref(database, `rooms/${roomId}/messages/${message.id}`);
  try {
    await set(messageRef, {
      text: message.text,
      senderId: message.senderId,
      createdAt: message.createdAt,
    });
    return true;
  } catch {
    return false;
  }
}

export function getFirebaseSetupLabel() {
  return isFirebaseConfigured ? 'Firebase realtime connected' : 'Local preview mode';
}

export function getRtcConfiguration() {
  const turnUrl = process.env.EXPO_PUBLIC_TURN_URL;
  const turnUsername = process.env.EXPO_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.EXPO_PUBLIC_TURN_CREDENTIAL;

  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      ...(turnUrl && turnUsername && turnCredential
        ? [
            {
              urls: turnUrl,
              username: turnUsername,
              credential: turnCredential,
            },
          ]
        : []),
    ],
  };
}