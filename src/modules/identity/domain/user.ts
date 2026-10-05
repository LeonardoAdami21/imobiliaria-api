import { AggregateRoot, newId } from '@/shared/domain/entity';
import { Email } from '@/shared/domain/email';
import { BusinessRuleError, ValidationError } from '@/shared/domain/errors';

export const USER_ROLES = ['ADMIN', 'MANAGER', 'BROKER', 'FINANCE'] as const;
/** ADMIN = administrador, MANAGER = gerente, BROKER = corretor, FINANCE = financeiro. */
export type UserRole = (typeof USER_ROLES)[number];

export interface UserProps {
  name: string;
  email: Email;
  passwordHash: string;
  role: UserRole;
  creci: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  creci?: string | null;
}

/** Usuário do sistema: funcionário da imobiliária que faz login. */
export class User extends AggregateRoot<UserProps> {
  static create(input: CreateUserInput): User {
    const now = new Date();
    const user = new User(newId(), {
      name: User.validName(input.name),
      email: Email.create(input.email),
      passwordHash: input.passwordHash,
      role: input.role,
      creci: input.creci?.trim() || null,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    user.assertBrokerHasCreci();
    return user;
  }

  static restore(id: string, props: UserProps): User {
    return new User(id, props);
  }

  private static validName(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length < 2) throw new ValidationError('Nome deve ter pelo menos 2 caracteres.');
    return trimmed;
  }

  /** Corretor só pode intermediar negócios com registro no CRECI. */
  private assertBrokerHasCreci(): void {
    if (this.props.role === 'BROKER' && !this.props.creci) {
      throw new BusinessRuleError('Corretor precisa ter o número do CRECI informado.', 'BROKER_WITHOUT_CRECI');
    }
  }

  get name(): string { return this.props.name; }
  get email(): Email { return this.props.email; }
  get passwordHash(): string { return this.props.passwordHash; }
  get role(): UserRole { return this.props.role; }
  get creci(): string | null { return this.props.creci; }
  get active(): boolean { return this.props.active; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  updateProfile(changes: { name?: string; role?: UserRole; creci?: string | null }): void {
    if (changes.name !== undefined) this.props.name = User.validName(changes.name);
    if (changes.role !== undefined) this.props.role = changes.role;
    if (changes.creci !== undefined) this.props.creci = changes.creci?.trim() || null;
    this.assertBrokerHasCreci();
    this.touch();
  }

  changePassword(passwordHash: string): void {
    this.props.passwordHash = passwordHash;
    this.touch();
  }

  deactivate(): void {
    this.props.active = false;
    this.touch();
  }

  activate(): void {
    this.props.active = true;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
