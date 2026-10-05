import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ForbiddenError, UnauthorizedError } from '@/shared/domain/errors';
import { type AuthUser, IS_PUBLIC, ROLES } from '@/shared/infra/http/auth';
import { VerifyAccessToken } from '../application/user-use-cases';

function bearerToken(request: Request): string | null {
  const [scheme, token] = (request.headers.authorization ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/**
 * Guard global: toda rota exige token Bearer, salvo as marcadas com @Public().
 * Depois confere o papel exigido por @Roles(). Roda antes da validação do corpo,
 * então um papel sem permissão recebe 403 mesmo enviando dados inválidos.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(VerifyAccessToken) private readonly verifyAccessToken: VerifyAccessToken,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = bearerToken(request);
    const user = token ? await this.verifyAccessToken.execute({ token }) : null;
    if (!user) throw new UnauthorizedError('Token ausente, inválido ou expirado.', 'INVALID_TOKEN');

    const roles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(user.role)) throw new ForbiddenError();

    request.user = user;
    return true;
  }
}
