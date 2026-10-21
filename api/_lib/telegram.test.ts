import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyInitData } from "./telegram.ts";

const TOKEN = "123456:TEST";
const NOW = 1_800_000_000;

// Builds initData exactly the way Telegram signs it
function sign(fields: Record<string, string>, token = TOKEN) {
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const fields = { auth_date: String(NOW - 60), query_id: "AAE", user: JSON.stringify({ id: 42, first_name: "Тест" }) };

test("accepts data signed with the bot token", () => {
  assert.equal(verifyInitData(sign(fields), TOKEN, NOW), 42);
});

test("rejects another bot's signature", () => {
  assert.equal(verifyInitData(sign(fields, "999:OTHER"), TOKEN, NOW), null);
});

test("rejects a forged user id", () => {
  const forged = new URLSearchParams(sign(fields));
  forged.set("user", JSON.stringify({ id: 7, first_name: "Тест" }));
  assert.equal(verifyInitData(forged.toString(), TOKEN, NOW), null);
});

test("rejects data older than a day", () => {
  assert.equal(verifyInitData(sign({ ...fields, auth_date: String(NOW - 2 * 86400) }), TOKEN, NOW), null);
});

test("rejects missing hash and empty token", () => {
  assert.equal(verifyInitData("auth_date=1", TOKEN, NOW), null);
  assert.equal(verifyInitData(sign(fields), "", NOW), null);
});
