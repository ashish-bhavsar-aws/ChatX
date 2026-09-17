import { gcm } from '@noble/ciphers/aes.js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_NAME = 'pulse.chat.encryption-key.v1';
const ALGORITHM = 'AES-256-GCM';

export type EncryptedText = {
  v: 1;
  alg: typeof ALGORITHM;
  iv: string;
  data: string;
};

let keyPromise: Promise<Uint8Array> | null = null;

function toBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function fromHex(value: string) {
  return Uint8Array.from(value.match(/.{1,2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
}

async function digestKeyMaterial(value: string) {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    value,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return fromHex(digest);
}

async function getEncryptionKey() {
  if (!keyPromise) {
    keyPromise = (async () => {
      // Configure a random EXPO_PUBLIC_CHAT_ENCRYPTION_KEY for shared encrypted
      // Firebase rooms. The project id fallback keeps the local preview usable.
      const configuredKey =
        process.env.EXPO_PUBLIC_CHAT_ENCRYPTION_KEY ??
        process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
      if (configuredKey) return digestKeyMaterial(configuredKey);

      const storedKey =
        Platform.OS === 'web'
          ? await AsyncStorage.getItem(KEY_NAME)
          : await SecureStore.getItemAsync(KEY_NAME);
      if (storedKey) return fromBase64(storedKey);

      const generatedKey = await Crypto.getRandomBytesAsync(32);
      const encodedKey = toBase64(generatedKey);
      if (Platform.OS === 'web') {
        await AsyncStorage.setItem(KEY_NAME, encodedKey);
      } else {
        await SecureStore.setItemAsync(KEY_NAME, encodedKey, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      }
      return generatedKey;
    })().catch((error) => {
      keyPromise = null;
      throw error;
    });
  }
  return keyPromise;
}

export async function encryptText(text: string): Promise<EncryptedText> {
  const key = await getEncryptionKey();
  const iv = await Crypto.getRandomBytesAsync(12);
  const plaintext = new TextEncoder().encode(text);
  const encrypted = gcm(key, iv).encrypt(plaintext);
  return {
    v: 1,
    alg: ALGORITHM,
    iv: toBase64(iv),
    data: toBase64(encrypted),
  };
}

export async function decryptText(value: unknown): Promise<string> {
  if (typeof value === 'string') return value;
  if (
    !value ||
    typeof value !== 'object' ||
    (value as Partial<EncryptedText>).v !== 1 ||
    (value as Partial<EncryptedText>).alg !== ALGORITHM
  ) {
    throw new Error('Unsupported encrypted message format');
  }
  const encrypted = value as EncryptedText;
  const key = await getEncryptionKey();
  const plaintext = gcm(key, fromBase64(encrypted.iv)).decrypt(fromBase64(encrypted.data));
  return new TextDecoder().decode(plaintext);
}

export async function encryptJson<T>(value: T) {
  return JSON.stringify({
    v: 1,
    alg: ALGORITHM,
    payload: await encryptText(JSON.stringify(value)),
  });
}

export async function decryptJson<T>(value: string, fallback: T): Promise<T> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'payload' in parsed
    ) {
      const plaintext = await decryptText((parsed as { payload: unknown }).payload);
      return JSON.parse(plaintext) as T;
    }
    // Legacy plaintext is read once and rewritten encrypted by the caller.
    return parsed as T;
  } catch {
    return fallback;
  }
}