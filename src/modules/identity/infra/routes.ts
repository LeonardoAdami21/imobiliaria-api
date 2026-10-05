import { z } from 'zod';
import { idParams, optionalText, pagination, publicRoute, queryBoolean, type Route, route } from '@/shared/infra/http/route';
import type {
  Authenticate,
  ChangeOwnPassword,
  GetUser,
  ListUsers,
  RegisterUser,
  UpdateUser,
} from '../application/user-use-cases';
import { USER_ROLES, type UserRole } from '../domain/user';

export interface IdentityUseCases {
  authenticate: Authenticate;
  changeOwnPassword: ChangeOwnPassword;
  registerUser: RegisterUser;
  getUser: GetUser;
  listUsers: ListUsers;
  updateUser: UpdateUser;
}

const ADMIN: UserRole[] = ['ADMIN'];
const MANAGEMENT: UserRole[] = ['ADMIN', 'MANAGER'];
const role = z.enum(USER_ROLES);

export function identityRoutes(useCases: IdentityUseCases): Route[] {
  return [
    publicRoute({
      method: 'post',
      path: '/auth/login',
      tag: 'Autenticação',
      summary: 'Entrar com e-mail e senha e receber o token de acesso',
      body: z.object({ email: z.email(), password: z.string().min(1) }),
      handler: ({ body }) => useCases.authenticate.execute(body),
    }),
    route({
      method: 'get',
      path: '/auth/me',
      tag: 'Autenticação',
      summary: 'Dados do usuário autenticado',
      handler: ({ user }) => useCases.getUser.execute({ id: user.id }),
    }),
    route({
      method: 'patch',
      path: '/auth/me/password',
      tag: 'Autenticação',
      summary: 'Trocar a própria senha',
      body: z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) }),
      handler: ({ body, user }) => useCases.changeOwnPassword.execute({ userId: user.id, ...body }),
    }),
    route({
      method: 'post',
      path: '/users',
      tag: 'Usuários',
      summary: 'Cadastrar usuário (corretor, gerente, financeiro ou administrador)',
      roles: ADMIN,
      status: 201,
      body: z.object({
        name: z.string().trim().min(2).max(120),
        email: z.email(),
        password: z.string().min(8).max(200),
        role,
        creci: optionalText(30),
      }),
      handler: ({ body }) => useCases.registerUser.execute(body),
    }),
    route({
      method: 'get',
      path: '/users',
      tag: 'Usuários',
      summary: 'Listar usuários',
      roles: MANAGEMENT,
      query: z.object({ ...pagination, role: role.optional(), active: queryBoolean.optional() }),
      handler: ({ query }) => useCases.listUsers.execute(query),
    }),
    route({
      method: 'get',
      path: '/users/:id',
      tag: 'Usuários',
      summary: 'Consultar usuário',
      roles: MANAGEMENT,
      params: idParams,
      handler: ({ params }) => useCases.getUser.execute(params),
    }),
    route({
      method: 'patch',
      path: '/users/:id',
      tag: 'Usuários',
      summary: 'Alterar nome, papel, CRECI ou ativar/desativar usuário',
      roles: ADMIN,
      params: idParams,
      body: z.object({
        name: z.string().trim().min(2).max(120).optional(),
        role: role.optional(),
        creci: optionalText(30),
        active: z.boolean().optional(),
      }),
      handler: ({ params, body, user }) => useCases.updateUser.execute({ id: params.id, actorId: user.id, ...body }),
    }),
  ];
}
