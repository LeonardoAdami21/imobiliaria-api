import { beforeEach, describe, expect, it } from 'vitest';
import { buildInMemoryApp, type InMemoryApp } from '@/main/testing';
import { BusinessRuleError, ConflictError, ForbiddenError, UnauthorizedError, ValidationError } from '@/shared/domain/errors';

describe('Identidade', () => {
  let app: InMemoryApp;
  const admin = { name: 'Ana Admin', email: 'ana@imob.com.br', password: 'senha-forte-1', role: 'ADMIN' as const };

  beforeEach(() => {
    app = buildInMemoryApp();
  });

  it('cadastra usuário guardando só o hash da senha', async () => {
    const user = await app.identity.registerUser.execute(admin);

    expect(user).toMatchObject({ name: 'Ana Admin', email: 'ana@imob.com.br', role: 'ADMIN', active: true });
    expect(user).not.toHaveProperty('passwordHash');
    expect(app.repos.users.items[0]!.passwordHash).not.toBe(admin.password);
  });

  it('não permite dois usuários com o mesmo e-mail', async () => {
    await app.identity.registerUser.execute(admin);
    await expect(app.identity.registerUser.execute({ ...admin, email: 'ANA@imob.com.br' })).rejects.toThrow(ConflictError);
  });

  it('exige CRECI para corretor e senha com 8 caracteres', async () => {
    await expect(app.identity.registerUser.execute({ ...admin, role: 'BROKER' })).rejects.toThrow(BusinessRuleError);
    await expect(app.identity.registerUser.execute({ ...admin, password: '123' })).rejects.toThrow(ValidationError);
  });

  it('autentica com credenciais corretas e recusa as erradas com a mesma mensagem', async () => {
    await app.identity.registerUser.execute(admin);

    const session = await app.identity.authenticate.execute({ email: 'Ana@imob.com.br', password: admin.password });
    expect(session.token).toBeTruthy();
    expect(session.user.email).toBe('ana@imob.com.br');

    const wrongPassword = app.identity.authenticate.execute({ email: admin.email, password: 'errada' });
    const unknownEmail = app.identity.authenticate.execute({ email: 'ninguem@imob.com.br', password: admin.password });
    await expect(wrongPassword).rejects.toThrow('E-mail ou senha inválidos.');
    await expect(unknownEmail).rejects.toThrow('E-mail ou senha inválidos.');
  });

  it('usuário desativado não entra e seu token deixa de valer', async () => {
    const root = await app.identity.registerUser.execute(admin);
    const other = await app.identity.registerUser.execute({ ...admin, email: 'bia@imob.com.br', role: 'FINANCE' });
    const { token } = await app.identity.authenticate.execute({ email: other.email, password: admin.password });
    expect(await app.container.authenticate(token)).toEqual({ id: other.id, role: 'FINANCE' });

    await app.identity.updateUser.execute({ id: other.id, actorId: root.id, active: false });

    await expect(app.identity.authenticate.execute({ email: other.email, password: admin.password })).rejects.toThrow(UnauthorizedError);
    expect(await app.container.authenticate(token)).toBeNull();
  });

  it('administrador não pode desativar a si mesmo', async () => {
    const root = await app.identity.registerUser.execute(admin);
    await expect(app.identity.updateUser.execute({ id: root.id, actorId: root.id, active: false })).rejects.toThrow(ForbiddenError);
  });

  it('troca a própria senha somente informando a atual', async () => {
    const user = await app.identity.registerUser.execute(admin);
    const change = { userId: user.id, newPassword: 'nova-senha-forte' };

    await expect(app.identity.changeOwnPassword.execute({ ...change, currentPassword: 'errada' })).rejects.toThrow(UnauthorizedError);
    await app.identity.changeOwnPassword.execute({ ...change, currentPassword: admin.password });

    await expect(app.identity.authenticate.execute({ email: admin.email, password: 'nova-senha-forte' })).resolves.toBeTruthy();
  });

  it('cria o administrador inicial apenas quando não há nenhum usuário', async () => {
    const first = await app.identity.ensureAdminUser.execute({ name: 'Admin', email: 'admin@imob.com.br', password: 'senha-forte-1' });
    const second = await app.identity.ensureAdminUser.execute({ name: 'Outro', email: 'outro@imob.com.br', password: 'senha-forte-1' });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(app.repos.users.items).toHaveLength(1);
  });
});
