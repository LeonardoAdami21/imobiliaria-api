import type { Page } from '@/shared/application/contracts';
import { InMemoryRepository } from '@/shared/testing/in-memory-repository';
import type { PasswordHasher, TokenPayload, TokenService } from '../application/ports';
import type { User } from '../domain/user';
import type { UserFilters, UserRepository } from '../domain/user-repository';

export class InMemoryUserRepository extends InMemoryRepository<User> implements UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    return this.items.find((user) => user.email.value === email) ?? null;
  }

  async count(): Promise<number> {
    return this.items.length;
  }

  async search(filters: UserFilters): Promise<Page<User>> {
    const found = this.items.filter(
      (user) =>
        (filters.role === undefined || user.role === filters.role) &&
        (filters.active === undefined || user.active === filters.active),
    );
    return this.paginate(found, filters);
  }
}

export class FakeHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return `hashed:${plain}`;
  }
  async verify(plain: string, hash: string): Promise<boolean> {
    return hash === `hashed:${plain}`;
  }
}

export class FakeTokenService implements TokenService {
  async sign(payload: TokenPayload): Promise<string> {
    return JSON.stringify(payload);
  }
  async verify(token: string): Promise<TokenPayload | null> {
    try {
      return JSON.parse(token) as TokenPayload;
    } catch {
      return null;
    }
  }
}
