# Pulse Realtime Chat Calls

Pulse is a React Native chat app for Android and iOS with Firebase realtime messaging and native WebRTC audio/video calling.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Firebase client envs: `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_DATABASE_URL`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`, `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID`
- Optional TURN envs: `EXPO_PUBLIC_TURN_URL`, `EXPO_PUBLIC_TURN_USERNAME`, `EXPO_PUBLIC_TURN_CREDENTIAL`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/realtime-chat-calls/app/index.tsx` — inbox, chat detail, composer, and call surface
- `artifacts/realtime-chat-calls/services/firebase.ts` — Firebase Realtime Database adapter and ICE server configuration
- `artifacts/realtime-chat-calls/services/call.ts` — platform-safe native WebRTC capture and peer connection foundation
- `artifacts/realtime-chat-calls/constants/colors.ts` — Pulse dark theme tokens

## Architecture decisions

- Firebase is optional at startup: the app persists a local preview conversation until the Firebase client envs are supplied.
- Google STUN servers are always included; TURN is opt-in through runtime configuration because Google does not provide a public TURN relay.
- WebRTC is loaded lazily on native platforms so the browser preview remains usable.

## Product

- Inbox with search and unread states
- Persistent local conversations with Firebase Realtime Database synchronization when configured
- Audio/video call UI with native camera/microphone capture, mute, camera toggle, private-call indicator, and hang-up

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
