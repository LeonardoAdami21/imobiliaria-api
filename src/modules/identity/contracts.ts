import type { UserRole } from './domain/user';

export type { UserRole };

/**
 * Contrato público do módulo de identidade.
 * Outros módulos enxergam usuários só por aqui, nunca pela entidade User.
 */
export interface UserSummary {
  id: string;
  name: string;
  role: UserRole;
  creci: string | null;
}

export interface UserDirectory {
  /** Devolve o usuário apenas se existir e estiver ativo. */
  findActiveUser(id: string): Promise<UserSummary | null>;
}
