import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Route } from "../router.js";
import { adminAuth, db, requireUid } from "../_lib/firebase.js";
import { body, HttpError } from "../_lib/http.js";
import { sendMessage, verifyInitData } from "../_lib/telegram.js";

const BOT = process.env.TELEGRAM_BOT_USERNAME || "Willy_Billi_bot";
const LINK_TTL_MS = 15 * 60 * 1000;

// user_links/{telegramId} and tg_link_tokens are server-only: firestore.rules gives clients no access
export const tg: Route[] = [
  // Mini App: Telegram-signed initData → Firebase sign-in token for the linked Google account
  ["POST", "/tg/auth", async ({ req }) => {
    const tgId = verifyInitData(String(body(req).initData || ""), process.env.TELEGRAM_BOT_TOKEN || "");
    if (!tgId) throw new HttpError(401, "Telegram не подтвердил вход. Откройте планер заново.");
    const link = (await db.doc(`user_links/${tgId}`).get()).data();
    const uid = link?.userId || link?.linked_uid; // linked_uid: links made by the old code
    if (!uid) throw new HttpError(404, "Telegram ещё не подключён к планеру.");
    return { token: await adminAuth.createCustomToken(uid) };
  }],

  // Browser: one-time deep link that ties the bot chat to the signed-in Google account
  ["POST", "/tg/link", async ({ req }) => {
    const uid = await requireUid(req);
    const token = randomBytes(24).toString("base64url");
    await db.doc(`tg_link_tokens/${token}`).set({ uid, expiresAt: Date.now() + LINK_TTL_MS });
    return { url: `https://t.me/${BOT}?start=${token}` };
  }],

  ["POST", "/tg/webhook", async ({ req }) => {
    const secret = Buffer.from(String(req.headers["x-telegram-bot-api-secret-token"] || ""));
    const expected = Buffer.from(process.env.TELEGRAM_WEBHOOK_SECRET || "");
    if (!expected.length || secret.length !== expected.length || !timingSafeEqual(secret, expected)) throw new HttpError(401, "Нет доступа.");

    const msg = body(req).message;
    const text: string = msg?.text || "";
    if (!msg?.from?.id || !text.startsWith("/start")) return { ok: true };

    const token = text.split(" ")[1];
    const ref = token && /^[\w-]{20,64}$/.test(token) ? db.doc(`tg_link_tokens/${token}`) : null;
    const data = ref && (await ref.get()).data();
    if (!ref || !data || data.expiresAt < Date.now()) {
      await sendMessage(msg.chat.id, "Чтобы подключить Telegram, откройте планер в браузере и нажмите «Подключить Telegram».");
      return { ok: true };
    }
    await db.doc(`user_links/${msg.from.id}`).set({ userId: data.uid, linkedAt: new Date() });
    await ref.delete();
    await sendMessage(msg.chat.id, "Telegram подключён. Планер открывается кнопкой «Планер» внизу чата.");
    return { ok: true };
  }],
];
