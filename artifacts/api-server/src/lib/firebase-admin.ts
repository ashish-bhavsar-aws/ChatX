import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

let firebaseApp: App | null | undefined;

function getFirebaseApp() {
  if (firebaseApp !== undefined) return firebaseApp;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    firebaseApp = null;
    return firebaseApp;
  }

  try {
    const parsed = JSON.parse(raw) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
    firebaseApp = getApps()[0] ?? initializeApp({
      credential: cert({
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key.replace(/\\n/g, "\n"),
      }),
      databaseURL:
        process.env.FIREBASE_DATABASE_URL ??
        process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
    });
  } catch {
    firebaseApp = null;
  }
  return firebaseApp;
}

export function getFirebaseMessaging(): Messaging | null {
  const app = getFirebaseApp();
  return app ? getMessaging(app) : null;
}

export async function storePushToken(input: {
  userId: string;
  token: string;
  platform: "android" | "ios";
}) {
  const app = getFirebaseApp();
  const databaseUrl =
    process.env.FIREBASE_DATABASE_URL ??
    process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL;
  if (!app || !databaseUrl) return false;

  await getDatabase(app).ref(`pushTokens/${input.userId}`).set({
    token: input.token,
    platform: input.platform,
    updatedAt: Date.now(),
  });
  return true;
}

export async function getStoredPushToken(userId: string) {
  const app = getFirebaseApp();
  const databaseUrl =
    process.env.FIREBASE_DATABASE_URL ??
    process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL;
  if (!app || !databaseUrl) return null;
  const snapshot = await getDatabase(app).ref(`pushTokens/${userId}/token`).get();
  const token = snapshot.val();
  return typeof token === "string" && token.length > 0 ? token : null;
}