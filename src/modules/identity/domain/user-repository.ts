import type { Page, PageParams, Repository } from '@/shared/domain/repository';
import type { User, UserRole } from './user';

export interface UserFilters extends PageParams {
  role?: UserRole;
  active?: boolean;
}

export interface UserRepository extends Repository<User> {
  findByEmail(email: string): Promise<User | null>;
  count(): Promise<number>;
  search(filters: UserFilters): Promise<Page<User>>;
}
