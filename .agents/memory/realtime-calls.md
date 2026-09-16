---
name: Realtime calling constraints
description: Native WebRTC and Expo preview constraints for this mobile app.
---

Native WebRTC must be loaded lazily on native platforms; importing react-native-webrtc at module scope crashes the browser preview. The package also does not expose a usable Expo config plugin in this setup.

**Why:** Expo's browser preview evaluates shared imports, while react-native-webrtc expects native globals and its package entry is not a config-plugin module.

**How to apply:** Keep UI-safe call wrappers and lazy native requires in platform-agnostic files, and use explicit iOS/Android camera and microphone permissions in app.json.