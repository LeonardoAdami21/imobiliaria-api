import type { UserRole } from '../domain/user';

/** Portas: o que a aplicação precisa do mundo externo, sem saber como é feito. */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export interface TokenPayload {
  userId: string;
  role: UserRole;
}

export interface TokenService {
  sign(payload: TokenPayload): Promise<string>;
  /** Devolve null quando o token é inválido ou expirou. */
  verify(token: string): Promise<TokenPayload | null>;
}
