import type { User as UserRow } from '@/generated/prisma/client';
import type { Page } from '@/shared/application/contracts';
import { Email } from '@/shared/domain/email';
import { type PrismaContext, skipTake } from '@/shared/infra/database/prisma';
import { User } from '../domain/user';
import type { UserFilters, UserRepository } from '../domain/user-repository';

function toDomain(row: UserRow): User {
  return User.restore(row.id, {
    name: row.name,
    email: Email.create(row.email),
    passwordHash: row.passwordHash,
    role: row.role,
    creci: row.creci,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: PrismaContext) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.db.client.user.findUnique({ where: { id } });
    return row && toDomain(row);
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.db.client.user.findUnique({ where: { email } });
    return row && toDomain(row);
  }

  count(): Promise<number> {
    return this.db.client.user.count();
  }

  async search(filters: UserFilters): Promise<Page<User>> {
    const where = { role: filters.role, active: filters.active };
    const [rows, total] = await Promise.all([
      this.db.client.user.findMany({ where, orderBy: { name: 'asc' }, ...skipTake(filters) }),
      this.db.client.user.count({ where }),
    ]);
    return { items: rows.map(toDomain), total, page: filters.page, perPage: filters.perPage };
  }

  async save(user: User): Promise<void> {
    const data = {
      name: user.name,
      email: user.email.value,
      passwordHash: user.passwordHash,
      role: user.role,
      creci: user.creci,
      active: user.active,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
    await this.db.client.user.upsert({ where: { id: user.id }, create: { id: user.id, ...data }, update: data });
  }
}
