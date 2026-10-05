import type { Express } from 'express';
import type { PrismaClient } from '@/generated/prisma/client';
import { PrismaLeadRepository, PrismaPersonRepository, PrismaVisitRepository } from '@/modules/crm/infra/prisma-repositories';
import { PrismaUserRepository } from '@/modules/identity/infra/prisma-user-repository';
import { JwtTokenService, ScryptPasswordHasher } from '@/modules/identity/infra/security';
import { PrismaPropertyRepository } from '@/modules/properties/infra/prisma-property-repository';
import { PrismaLeaseRepository, PrismaRentChargeRepository } from '@/modules/rentals/infra/prisma-repositories';
import { PrismaProposalRepository, PrismaSaleRepository } from '@/modules/sales/infra/prisma-repositories';
import type { Clock } from '@/shared/application/contracts';
import { PrismaContext } from '@/shared/infra/database/prisma';
import { createHttpApp } from '@/shared/infra/http/app';
import { SystemClock } from '@/shared/infra/system-clock';
import { buildContainer, type Container } from './container';
import type { Env } from './env';

export interface Application {
  http: Express;
  container: Container;
}

/** Monta a aplicação de produção: casos de uso ligados ao PostgreSQL via Prisma, servidos por Express. */
export function createApplication(env: Env, prisma: PrismaClient, overrides: { clock?: Clock } = {}): Application {
  const db = new PrismaContext(prisma);

  const container = buildContainer({
    users: new PrismaUserRepository(db),
    people: new PrismaPersonRepository(db),
    leads: new PrismaLeadRepository(db),
    visits: new PrismaVisitRepository(db),
    properties: new PrismaPropertyRepository(db),
    leases: new PrismaLeaseRepository(db),
    charges: new PrismaRentChargeRepository(db),
    proposals: new PrismaProposalRepository(db),
    sales: new PrismaSaleRepository(db),
    uow: db,
    clock: overrides.clock ?? new SystemClock(env.BUSINESS_TIMEZONE),
    hasher: new ScryptPasswordHasher(),
    tokens: new JwtTokenService(env.JWT_SECRET, env.JWT_EXPIRES_IN),
  });

  const http = createHttpApp({
    routes: container.routes,
    authenticate: container.authenticate,
    corsOrigin: env.CORS_ORIGIN,
    title: `API ${env.AGENCY_NAME}`,
    logger: env.NODE_ENV === 'test' ? { error: () => {} } : console,
  });

  return { http, container };
}
