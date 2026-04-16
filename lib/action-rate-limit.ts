import { prisma } from "@/lib/prisma";

export interface ActionRateLimitOptions {
  maxAttempts: number;
  windowMs: number;
}

export class ActionRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super("Rate limit exceeded");
    this.name = "ActionRateLimitError";
  }
}

export async function checkActionRateLimit(
  key: string,
  opts: ActionRateLimitOptions
): Promise<void> {
  const windowStart = new Date(Date.now() - opts.windowMs);
  const count = await prisma.rateLimitEntry.count({
    where: { key, createdAt: { gte: windowStart } },
  });
  if (count >= opts.maxAttempts) {
    throw new ActionRateLimitError(opts.windowMs);
  }
  await prisma.rateLimitEntry.create({ data: { key } });
  // Async cleanup — best-effort
  void prisma.rateLimitEntry.deleteMany({
    where: { key, createdAt: { lt: windowStart } },
  });
}
