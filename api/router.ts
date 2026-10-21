import type { VercelRequest, VercelResponse } from "@vercel/node";
import { HttpError, type Ctx } from "./_lib/http.js";
import { tg } from "./_routes/tg.js";

export type Route = [method: string, pattern: string, handler: (ctx: Ctx) => Promise<unknown>];

// One function for the whole API: the Hobby plan allows only 12 serverless functions
const routes: Route[] = [...tg];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // vercel.json rewrites /api/<path> to this function as ?__path=<path>
  const rewritten = req.query.__path;
  const path = `/${Array.isArray(rewritten) ? rewritten.join("/") : rewritten || ""}`;
  const route = routes.find(([, pattern]) => pattern === path);
  if (!route) return res.status(404).json({ error: "Not found" });
  if (route[0] !== req.method) return res.status(405).json({ error: "Method not allowed" });
  try {
    res.status(200).json((await route[2]({ req, res, params: {} })) ?? { ok: true });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Внутренняя ошибка сервера. Попробуйте ещё раз." });
  }
}
