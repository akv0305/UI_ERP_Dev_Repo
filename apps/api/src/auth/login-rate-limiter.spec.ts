import {
  LOGIN_RATE_LIMIT_MAX,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  LoginRateLimiter,
} from './login-rate-limiter';
import { ChangePasswordRequest } from '@uie/contracts';

describe('LoginRateLimiter', () => {
  it('allows 10 attempts per minute per key and blocks the 11th', () => {
    const limiter = new LoginRateLimiter();

    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX; i += 1) {
      expect(limiter.consume('ip-a', 1000)).toBe(true);
    }

    expect(limiter.consume('ip-a', 1001)).toBe(false);
    expect(limiter.consume('ip-b', 1001)).toBe(true);
  });

  it('allows attempts again after the window has passed', () => {
    const limiter = new LoginRateLimiter();

    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX; i += 1) {
      limiter.consume('ip-a', 1000);
    }

    expect(limiter.consume('ip-a', 1000 + LOGIN_RATE_LIMIT_WINDOW_MS + 1)).toBe(true);
  });
});

describe('change-password policy', () => {
  const parse = (newPassword: string) =>
    ChangePasswordRequest.safeParse({ currentPassword: 'old', newPassword }).success;

  it('accepts at least 8 characters with a letter and a digit', () => {
    expect(parse('abcdefg1')).toBe(true);
    expect(parse('1234567a')).toBe(true);
  });

  it.each(['abc1', 'abcdefgh', '12345678', ''])('rejects %p', (value) => {
    expect(parse(value)).toBe(false);
  });
});
