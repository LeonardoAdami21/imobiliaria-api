import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { jwtVerify, SignJWT } from 'jose';
import type { PasswordHasher, TokenPayload, TokenService } from '../application/ports';
import { USER_ROLES, type UserRole } from '../domain/user';

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

/** Hash de senha com scrypt (nativo do Node, sem dependência compilada). Formato: scrypt$salt$hash. */
export class ScryptPasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await scrypt(plain, salt, 64);
    return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    const [scheme, saltHex, hashHex] = hash.split('$');
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const derived = await scrypt(plain, Buffer.from(saltHex, 'hex'), expected.length);
    return timingSafeEqual(derived, expected);
  }
}

/** Tokens JWT assinados com HS256. */
export class JwtTokenService implements TokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly expiresIn: string,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  sign(payload: TokenPayload): Promise<string> {
    return new SignJWT({ role: payload.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.userId)
      .setIssuedAt()
      .setExpirationTime(this.expiresIn)
      .sign(this.key);
  }

  async verify(token: string): Promise<TokenPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      const role = payload.role as UserRole;
      if (!payload.sub || !USER_ROLES.includes(role)) return null;
      return { userId: payload.sub, role };
    } catch {
      return null;
    }
  }
}
