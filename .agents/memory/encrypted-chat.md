---
name: Encrypted chat and push privacy
description: Privacy rules for Pulse message storage, synchronization, and push notifications.
---

Chat text must be encrypted before it is written to local storage or Firebase. Push notification payloads should not include message text because push providers and operating systems may retain or display it outside the encrypted chat store.

**Why:** The product requirement is encrypted chat storage, while FCM needs a notification payload that can be displayed before the app opens.

**How to apply:** Use the configured shared chat key for multi-device Firebase rooms. Keep generic notification copy for new messages and put only routing metadata in FCM data payloads. Native SecureStore is the fallback for local-only storage.