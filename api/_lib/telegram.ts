import { createHmac, timingSafeEqual } from "node:crypto";

const DAY = 24 * 60 * 60;

/** Telegram Mini App initData check (core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app). Returns the user id or null. */
export function verifyInitData(initData: string, botToken: string, now = Math.floor(Date.now() / 1000)): number | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !botToken) return null;
  params.delete("hash");
  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(checkString).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  // A leaked initData stays valid only for a day
  if (now - Number(params.get("auth_date")) > DAY) return null;
  try {
    const id = JSON.parse(params.get("user") || "{}").id;
    return Number.isSafeInteger(id) ? id : null;
  } catch {
    return null;
  }
}

export async function sendMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
