import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

@Injectable()
export class PasswordService {
  /** argon2id with the library defaults. */
  hash(password: string): Promise<string> {
    return hash(password);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
