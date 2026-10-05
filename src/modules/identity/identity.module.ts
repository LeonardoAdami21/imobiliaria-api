import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ENV, type Env } from '@/config/env';
import { PrismaContext } from '@/shared/infra/database/prisma';
import { provide } from '@/shared/infra/nest/provide';
import {
  Authenticate,
  ChangeOwnPassword,
  EnsureAdminUser,
  GetUser,
  ListUsers,
  RegisterUser,
  UpdateUser,
  UserDirectoryService,
  VerifyAccessToken,
} from './application/user-use-cases';
import { PASSWORD_HASHER, TOKEN_SERVICE, USER_DIRECTORY, USER_REPOSITORY } from './identity.tokens';
import { AuthController } from './infra/auth.controller';
import { AuthGuard } from './infra/auth.guard';
import { PrismaUserRepository } from './infra/prisma-user-repository';
import { JwtTokenService, ScryptPasswordHasher } from './infra/security';
import { UsersController } from './infra/users.controller';

/** Usuários, login e autorização. Registra o AuthGuard global que protege todas as rotas. */
@Module({
  controllers: [AuthController, UsersController],
  providers: [
    provide(PrismaUserRepository, [PrismaContext], USER_REPOSITORY),
    provide(ScryptPasswordHasher, [], PASSWORD_HASHER),
    {
      provide: TOKEN_SERVICE,
      useFactory: (env: Env) => new JwtTokenService(env.JWT_SECRET, env.JWT_EXPIRES_IN),
      inject: [ENV],
    },
    provide(UserDirectoryService, [USER_REPOSITORY], USER_DIRECTORY),

    provide(Authenticate, [USER_REPOSITORY, PASSWORD_HASHER, TOKEN_SERVICE]),
    provide(ChangeOwnPassword, [USER_REPOSITORY, PASSWORD_HASHER]),
    provide(RegisterUser, [USER_REPOSITORY, PASSWORD_HASHER]),
    provide(GetUser, [USER_REPOSITORY]),
    provide(ListUsers, [USER_REPOSITORY]),
    provide(UpdateUser, [USER_REPOSITORY]),
    provide(EnsureAdminUser, [USER_REPOSITORY, PASSWORD_HASHER]),
    provide(VerifyAccessToken, [TOKEN_SERVICE, USER_DIRECTORY]),

    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [USER_DIRECTORY, EnsureAdminUser],
})
export class IdentityModule {}
