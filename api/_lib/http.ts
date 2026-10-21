import type { VercelRequest, VercelResponse } from "@vercel/node";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Ctx = {
  req: VercelRequest;
  res: VercelResponse;
  params: Record<string, string>;
};

export function body<T = any>(req: VercelRequest): T {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      throw new HttpError(400, "Некорректный запрос.");
    }
  }
  return (req.body ?? {}) as T;
}
