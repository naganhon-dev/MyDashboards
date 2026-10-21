import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import type { VercelRequest } from "@vercel/node";
import { HttpError } from "./http.js";

// The planner lives in a named database of the AI Studio project, not in (default)
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || "ai-studio-02e4b077-942c-431a-85c6-93c2f00c94cf";

const app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}")) });

export const db = getFirestore(app, DATABASE_ID);
export const adminAuth = getAuth(app);

export async function requireUid(req: VercelRequest) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Требуется вход в аккаунт.");
  try {
    return (await adminAuth.verifyIdToken(token)).uid;
  } catch {
    throw new HttpError(401, "Сессия недействительна. Войдите заново.");
  }
}
