import { Injectable } from '@nestjs/common';

export const LOGIN_RATE_LIMIT_MAX = 10;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000;

/** In-memory sliding window: at most 10 login attempts per minute per IP. */
@Injectable()
export class LoginRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  /** Records an attempt and returns false when the IP is over the limit. */
  consume(key: string, now: number = Date.now()): boolean {
    const windowStart = now - LOGIN_RATE_LIMIT_WINDOW_MS;
    const recent = (this.attempts.get(key) ?? []).filter((time) => time > windowStart);

    if (recent.length >= LOGIN_RATE_LIMIT_MAX) {
      this.attempts.set(key, recent);
      return false;
    }

    recent.push(now);
    this.attempts.set(key, recent);
    this.sweep(windowStart);
    return true;
  }

  private sweep(windowStart: number): void {
    if (this.attempts.size < 1000) {
      return;
    }

    for (const [key, times] of this.attempts) {
      if (times.every((time) => time <= windowStart)) {
        this.attempts.delete(key);
      }
    }
  }
}
