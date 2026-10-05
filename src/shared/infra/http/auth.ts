import { applyDecorators, createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Actor } from '@/shared/application/contracts';

/** Usuário autenticado que fez a requisição. */
export type AuthUser = Actor;

export const IS_PUBLIC = 'auth:public';
export const ROLES = 'auth:roles';

/** Rota sem autenticação (login, health check). Todas as demais exigem token Bearer. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Exige token Bearer. Usado na classe do controller (ou no método, quando a classe tem rotas públicas). */
export const Authenticated = () =>
  applyDecorators(ApiBearerAuth(), ApiUnauthorizedResponse({ description: 'Não autenticado' }));

/** Papéis autorizados. Sem este decorator, qualquer usuário autenticado. */
export const Roles = (...roles: string[]) =>
  applyDecorators(SetMetadata(ROLES, roles), ApiForbiddenResponse({ description: `Restrito a: ${roles.join(', ')}` }));

/** Injeta no parâmetro o usuário autenticado, preenchido pelo AuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => context.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
