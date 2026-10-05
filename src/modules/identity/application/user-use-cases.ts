import type { Page, UseCase } from '@/shared/application/contracts';
import { mapPage } from '@/shared/application/contracts';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/shared/domain/errors';
import type { UserDirectory, UserSummary } from '../contracts';
import { User, type UserRole } from '../domain/user';
import type { UserFilters, UserRepository } from '../domain/user-repository';
import type { PasswordHasher, TokenService } from './ports';

export interface UserOutput {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  creci: string | null;
  active: boolean;
  createdAt: Date;
}

export function toUserOutput(user: User): UserOutput {
  return {
    id: user.id,
    name: user.name,
    email: user.email.value,
    role: user.role,
    creci: user.creci,
    active: user.active,
    createdAt: user.createdAt,
  };
}

function assertStrongPassword(password: string): void {
  if (password.length < 8) throw new ValidationError('A senha deve ter pelo menos 8 caracteres.', 'WEAK_PASSWORD');
}

// ───────────────────────────── Cadastro ─────────────────────────────

export interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  creci?: string | null;
}

export class RegisterUser implements UseCase<RegisterUserInput, UserOutput> {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: RegisterUserInput): Promise<UserOutput> {
    assertStrongPassword(input.password);
    if (await this.users.findByEmail(input.email.trim().toLowerCase())) {
      throw new ConflictError('Já existe um usuário com este e-mail.', 'EMAIL_ALREADY_IN_USE');
    }
    const user = User.create({ ...input, passwordHash: await this.hasher.hash(input.password) });
    await this.users.save(user);
    return toUserOutput(user);
  }
}

/** Cria o administrador inicial quando o banco ainda não tem nenhum usuário. */
export class EnsureAdminUser implements UseCase<{ name: string; email: string; password: string }, boolean> {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: { name: string; email: string; password: string }): Promise<boolean> {
    if ((await this.users.count()) > 0) return false;
    assertStrongPassword(input.password);
    await this.users.save(
      User.create({ ...input, role: 'ADMIN', passwordHash: await this.hasher.hash(input.password) }),
    );
    return true;
  }
}

// ───────────────────────────── Autenticação ─────────────────────────────

export interface AuthenticateOutput {
  token: string;
  user: UserOutput;
}

export class Authenticate implements UseCase<{ email: string; password: string }, AuthenticateOutput> {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: { email: string; password: string }): Promise<AuthenticateOutput> {
    const user = await this.users.findByEmail(input.email.trim().toLowerCase());
    // A mesma mensagem para e-mail inexistente e senha errada evita revelar quem tem conta.
    if (!user || !(await this.hasher.verify(input.password, user.passwordHash))) {
      throw new UnauthorizedError('E-mail ou senha inválidos.', 'INVALID_CREDENTIALS');
    }
    if (!user.active) throw new UnauthorizedError('Usuário desativado.', 'USER_INACTIVE');
    return { token: await this.tokens.sign({ userId: user.id, role: user.role }), user: toUserOutput(user) };
  }
}

export class ChangeOwnPassword
  implements UseCase<{ userId: string; currentPassword: string; newPassword: string }, void>
{
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: { userId: string; currentPassword: string; newPassword: string }): Promise<void> {
    const user = await this.users.findById(input.userId);
    if (!user) throw new NotFoundError('Usuário');
    if (!(await this.hasher.verify(input.currentPassword, user.passwordHash))) {
      throw new UnauthorizedError('Senha atual incorreta.', 'INVALID_CREDENTIALS');
    }
    assertStrongPassword(input.newPassword);
    user.changePassword(await this.hasher.hash(input.newPassword));
    await this.users.save(user);
  }
}

// ───────────────────────────── Consulta e manutenção ─────────────────────────────

export class GetUser implements UseCase<{ id: string }, UserOutput> {
  constructor(private readonly users: UserRepository) {}

  async execute({ id }: { id: string }): Promise<UserOutput> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError('Usuário');
    return toUserOutput(user);
  }
}

export class ListUsers implements UseCase<UserFilters, Page<UserOutput>> {
  constructor(private readonly users: UserRepository) {}

  async execute(filters: UserFilters): Promise<Page<UserOutput>> {
    return mapPage(await this.users.search(filters), toUserOutput);
  }
}

export interface UpdateUserInput {
  id: string;
  actorId: string;
  name?: string;
  role?: UserRole;
  creci?: string | null;
  active?: boolean;
}

export class UpdateUser implements UseCase<UpdateUserInput, UserOutput> {
  constructor(private readonly users: UserRepository) {}

  async execute(input: UpdateUserInput): Promise<UserOutput> {
    const user = await this.users.findById(input.id);
    if (!user) throw new NotFoundError('Usuário');

    const isSelf = input.id === input.actorId;
    if (isSelf && (input.active === false || (input.role && input.role !== user.role))) {
      // Impede que o último administrador se tranque para fora do sistema.
      throw new ForbiddenError('Você não pode desativar nem mudar o papel do seu próprio usuário.');
    }

    user.updateProfile({ name: input.name, role: input.role, creci: input.creci });
    if (input.active === true) user.activate();
    if (input.active === false) user.deactivate();
    await this.users.save(user);
    return toUserOutput(user);
  }
}

/** Implementação do contrato público consumido pelos outros módulos. */
export class UserDirectoryService implements UserDirectory {
  constructor(private readonly users: UserRepository) {}

  async findActiveUser(id: string): Promise<UserSummary | null> {
    const user = await this.users.findById(id);
    if (!user || !user.active) return null;
    return { id: user.id, name: user.name, role: user.role, creci: user.creci };
  }
}

// ───────────────────────────── Sessão ─────────────────────────────

/** Usuário dono de um token válido: o papel vem sempre do banco, não do token. */
export interface SessionUser {
  id: string;
  role: UserRole;
}

/** Um token só vale enquanto o usuário existir e estiver ativo. */
export class VerifyAccessToken implements UseCase<{ token: string }, SessionUser | null> {
  constructor(
    private readonly tokens: TokenService,
    private readonly users: UserDirectory,
  ) {}

  async execute({ token }: { token: string }): Promise<SessionUser | null> {
    const payload = await this.tokens.verify(token);
    if (!payload) return null;
    const user = await this.users.findActiveUser(payload.userId);
    return user && { id: user.id, role: user.role };
  }
}
