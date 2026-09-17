import { Router, type IRouter } from "express";
import {
  getFirebaseMessaging,
  getStoredPushToken,
  storePushToken,
} from "../lib/firebase-admin";

const router: IRouter = Router();

function requiredString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function sendNotification(input: {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
}) {
  const messaging = getFirebaseMessaging();
  if (!messaging) return null;
  return messaging.send({
    token: input.token,
    notification: { title: input.title, body: input.body },
    data: input.data,
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default" } } },
  });
}

async function sendNotificationToUser(input: {
  userId: string;
  title: string;
  body: string;
  data: Record<string, string>;
}) {
  const token = await getStoredPushToken(input.userId);
  if (!token) return null;
  return sendNotification({ ...input, token });
}

router.post("/notifications/register", async (req, res) => {
  const userId = requiredString(req.body?.userId);
  const token = requiredString(req.body?.token);
  const platform = req.body?.platform;
  if (!userId || !token || (platform !== "android" && platform !== "ios")) {
    res.status(400).json({ ok: false });
    return;
  }

  try {
    const registered = await storePushToken({ userId, token, platform });
    if (!registered) {
      res.status(503).json({ ok: false });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

router.post("/notifications/send-message", async (req, res) => {
  const recipientUserId = requiredString(req.body?.recipientUserId);
  const senderName = requiredString(req.body?.senderName);
  const roomId = requiredString(req.body?.roomId);
  if (!recipientUserId || !senderName || !roomId) {
    res.status(400).json({ ok: false });
    return;
  }

  try {
    const messageId = await sendNotificationToUser({
      userId: recipientUserId,
      title: senderName,
      body: `${senderName} sent you a message`,
      data: { type: "chat_message", roomId },
    });
    if (!messageId) {
      res.status(503).json({ ok: false });
      return;
    }
    res.json({ ok: true, messageId });
  } catch {
    res.status(503).json({ ok: false });
  }
});

router.post("/notifications/send-call", async (req, res) => {
  const recipientUserId = requiredString(req.body?.recipientUserId);
  const callerName = requiredString(req.body?.callerName);
  const callId = requiredString(req.body?.callId);
  const mode = req.body?.mode;
  if (!recipientUserId || !callerName || !callId || (mode !== "audio" && mode !== "video")) {
    res.status(400).json({ ok: false });
    return;
  }

  try {
    const messageId = await sendNotificationToUser({
      userId: recipientUserId,
      title: mode === "video" ? "Incoming video call" : "Incoming audio call",
      body: `${callerName} is calling`,
      data: { type: "incoming_call", callId, mode },
    });
    if (!messageId) {
      res.status(503).json({ ok: false });
      return;
    }
    res.json({ ok: true, messageId });
  } catch {
    res.status(503).json({ ok: false });
  }
});

export default router;