import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '@/config/env';
import { PrismaClient } from '@/generated/prisma/client';
import { createPrismaClient, PrismaContext } from './infra/database/prisma';
import { SystemClock } from './infra/system-clock';
import { provide } from './infra/nest/provide';
import { CLOCK, UNIT_OF_WORK } from './tokens';

/** Infraestrutura usada por todos os módulos: banco (Prisma), unidade de trabalho e relógio. */
@Global()
@Module({
  providers: [
    { provide: PrismaClient, useFactory: (env: Env) => createPrismaClient(env.DATABASE_URL), inject: [ENV] },
    provide(PrismaContext, [PrismaClient]),
    { provide: UNIT_OF_WORK, useExisting: PrismaContext },
    { provide: CLOCK, useFactory: (env: Env) => new SystemClock(env.BUSINESS_TIMEZONE), inject: [ENV] },
  ],
  exports: [PrismaClient, PrismaContext, UNIT_OF_WORK, CLOCK],
})
export class CoreModule {}
