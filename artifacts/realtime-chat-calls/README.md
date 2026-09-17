# Pulse Realtime Chat Calls

Pulse is a React Native chat app for iOS and Android with:

- WhatsApp-inspired light and dark chat UI
- Firebase Realtime Database message synchronization
- AES-256-GCM encrypted local and Firebase message storage
- Offline-first message sending with automatic retry
- Firebase Cloud Messaging notifications for messages and calls
- Native WebRTC audio and video calls
- Google STUN with optional TURN relay support
- Low-bandwidth video safeguards

## 1. Install and run

From the repository root:

```bash
pnpm install
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/realtime-chat-calls run dev
```

The API server and Expo workflow are separate services. The browser preview is useful for
checking the UI and offline chat behavior, but native camera, microphone, WebRTC, and push
notification behavior must be tested in an iOS or Android build on a physical device.

## 2. Firebase project setup

Create a Firebase project and enable:

1. Realtime Database
2. Cloud Messaging
3. An Android app and an iOS app for native builds
4. A Web app for the Expo JavaScript Firebase client configuration

Add these client variables to the Expo workflow:

| Variable | Required | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Yes | Firebase Web SDK |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | Firebase Web SDK |
| `EXPO_PUBLIC_FIREBASE_DATABASE_URL` | Yes | Realtime Database |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | Yes | Firebase project |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | Yes | Firebase Web SDK |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Yes | FCM project sender |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | Yes | Firebase Web SDK |

Add these server variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes | Firebase Admin and FCM HTTP v1 sending |
| `FIREBASE_DATABASE_URL` | Recommended | Server-side push-token storage |

`FIREBASE_SERVICE_ACCOUNT_JSON` is a secret. Add it through the workspace Secrets flow;
never commit it, print it, or add it to `app.json`.

The server also accepts `EXPO_PUBLIC_FIREBASE_DATABASE_URL` as a fallback for
`FIREBASE_DATABASE_URL`.

## 3. Encryption configuration

Set the same random value in every build that must read the same encrypted Firebase rooms:

```text
EXPO_PUBLIC_CHAT_ENCRYPTION_KEY=<random shared application key>
```

The app derives a 32-byte AES key from this value and encrypts each message with a fresh
12-byte nonce using AES-256-GCM. Local conversation snapshots and pending queues are also
encrypted before they are written to AsyncStorage.

If the shared key is omitted:

- Browser preview uses a project-scoped fallback when the Firebase project ID exists.
- Native local-only storage falls back to a key held in SecureStore.
- Separate native installations may not be able to decrypt each other's Firebase messages.

This is application-level encryption for stored message content. Because the key is needed
by the client, it is not a complete end-to-end encryption or user-key-management system.
Production apps should add authenticated users and a real key exchange before treating the
messages as end-to-end encrypted.

## 4. FCM setup

The app requests notification permission only after the user selects **Settings**. This
avoids prompting unexpectedly on first launch.

The registration flow:

1. Requests notification permission.
2. Gets the device's native push token.
3. Registers it at `POST /api/notifications/register`.
4. Stores the token in Firebase under `pushTokens/{userId}`.

Notification endpoints:

```text
POST /api/notifications/register
POST /api/notifications/send-message
POST /api/notifications/send-call
```

New-message pushes intentionally contain generic text instead of chat content. This prevents
encrypted message text from being copied into the FCM payload or shown on a lock screen.

Set a different mobile identity for each signed-in user:

```text
EXPO_PUBLIC_USER_ID=maya
```

The demo defaults to `me`. This value is used for call signaling and push-token lookup; it is
not an authentication system.

### Native push requirements

- Android needs notification permission on Android 13+.
- iOS needs an Apple push capability and APNs credentials connected to the Firebase iOS app.
- Native Firebase app configuration must be included in the iOS/Android build.
- Push notifications do not work in the browser preview or on a simulator without the
  required native push services.

## 5. WebRTC calling configuration

Google STUN servers are included automatically:

```text
stun:stun.l.google.com:19302
stun:stun1.l.google.com:19302
```

Google does not provide a public TURN relay. For networks that block peer-to-peer traffic,
configure a TURN provider:

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_TURN_URL` | TURN URL, including `turn:` or `turns:` |
| `EXPO_PUBLIC_TURN_USERNAME` | TURN username |
| `EXPO_PUBLIC_TURN_CREDENTIAL` | TURN credential |

All three TURN variables are required before the TURN server is added to the ICE list.

## 6. Low-network behavior

Video calls are intentionally conservative by default:

- Initial camera capture is limited to 480×640 at 15 fps.
- The sender starts with a 320 kbps video ceiling.
- If the peer connection becomes disconnected or fails, the sender reduces to 180 kbps,
  10 fps, and a 1.5× resolution scale.
- The call screen displays a low-bandwidth notice when the reduced profile is active.
- The camera control can be turned off so the call continues as a lower-bandwidth audio call.
- Firebase signaling and call cleanup are failure-safe; losing internet does not crash the UI.

For difficult mobile networks, use TURN and prefer audio-only calls. Do not raise the video
resolution or bitrate until the call works reliably on the target cellular networks.

## 7. Offline chat behavior

When the device loses connectivity:

- Previously cached chats remain visible.
- New messages appear immediately in the conversation.
- Messages waiting for Firebase are stored in an encrypted local queue.
- The queue retries in order after NetInfo reports connectivity.
- A visible offline banner tells the user that delivery is pending.

Firebase subscription and FCM failures are contained. The user can continue reading and
composing messages while offline.

## 8. Visual design

The Pulse interface uses a rich WhatsApp-inspired visual system:

- Deep green app bars and primary actions
- Warm, distinct contact avatars
- Compact conversation rows with unread states
- Rounded search and composer controls
- Separate immersive call surface with private-call indicator
- Responsive safe-area spacing for notches, home indicators, and browser preview
- Inter typography with light/dark semantic color tokens

The main UI lives in `app/index.tsx`; shared color behavior is in `constants/colors.ts` and
`hooks/useColors.ts`.

## 9. Useful files

| File | Responsibility |
| --- | --- |
| `app/index.tsx` | Inbox, chat detail, offline queue, call surface |
| `services/firebase.ts` | Firebase messages, encrypted message mapping, ICE configuration |
| `services/crypto.ts` | AES-256-GCM encryption and key storage |
| `services/call.ts` | WebRTC capture, bitrate adaptation, Firebase offer/answer/ICE signaling |
| `services/notifications.ts` | Permission request and native token registration |
| `app.json` | Camera, microphone, notification, and background-mode configuration |
| `../api-server/src/routes/notifications.ts` | FCM registration and notification endpoints |
| `../../lib/api-spec/openapi.yaml` | API contract for notification endpoints |

## 10. Verification commands

```bash
pnpm --filter @workspace/realtime-chat-calls run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build
pnpm -w run typecheck:libs
```

Before release, verify two physical devices with:

1. The same shared encryption key
2. Different `EXPO_PUBLIC_USER_ID` values
3. Firebase client configuration
4. Firebase service-account configuration
5. Android/iOS native push configuration
6. A TURN server if either device is on a restrictive cellular or office network