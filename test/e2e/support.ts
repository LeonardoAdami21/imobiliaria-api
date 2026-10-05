import 'dotenv/config';
import type { Server } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { ENV, type Env } from '@/config/env';
import { PrismaClient } from '@/generated/prisma/client';
import { EnsureAdminUser } from '@/modules/identity/application/user-use-cases';
import { FixedClock } from '@/shared/testing/in-memory-repository';
import { cpf, TEST_ENV } from '@/shared/testing/in-memory-app';
import { CLOCK } from '@/shared/tokens';

/**
 * Banco usado pelos testes de ponta a ponta: DATABASE_URL_TEST, se definida,
 * ou o mesmo servidor do .env com o sufixo "_test" no nome do banco.
 * Nunca é o banco de desenvolvimento, porque os testes apagam todos os dados.
 */
export function testDatabaseUrl(): string {
  if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST;
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://imob:imob@localhost:5432/imobiliaria');
  url.pathname = `${url.pathname.replace(/_test$/, '')}_test`;
  return url.toString();
}

const ADMIN = { email: 'admin@teste.com.br', password: 'senha-de-teste-1' };

export interface TestApi {
  http: Server;
  prisma: PrismaClient;
  clock: FixedClock;
  adminToken: string;
  /** Faz a chamada autenticada e devolve a resposta do supertest. */
  call(method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, body?: unknown, token?: string): Promise<request.Response>;
  /** Como `call`, mas exige o status esperado e devolve só o corpo. */
  ok<T = any>(method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, body?: unknown, status?: number): Promise<T>;
  login(email: string, password: string): Promise<string>;
  close(): Promise<void>;
}

/** Sobe a aplicação real (NestJS + Prisma + PostgreSQL) com o banco limpo e um administrador criado. */
export async function startTestApi(now = '2026-03-10T12:00:00Z'): Promise<TestApi> {
  const env: Env = { ...TEST_ENV, DATABASE_URL: testDatabaseUrl() };
  const clock = new FixedClock(now);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(env)
    .overrideProvider(CLOCK)
    .useValue(clock)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app, env);
  await app.init();
  const http = app.getHttpServer() as Server;
  const prisma = app.get(PrismaClient);

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tables.map((table) => `"${table.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
  await app.get(EnsureAdminUser).execute({ name: env.ADMIN_NAME, ...ADMIN });

  const login = async (email: string, password: string): Promise<string> => {
    const response = await request(http).post('/auth/login').send({ email, password });
    if (response.status !== 200) throw new Error(`Login falhou: ${JSON.stringify(response.body)}`);
    return response.body.token as string;
  };
  const adminToken = await login(ADMIN.email, ADMIN.password);

  const call: TestApi['call'] = async (method, path, body, token = adminToken) => {
    const pending = request(http)[method](path).set('Authorization', `Bearer ${token}`);
    return body === undefined ? pending : pending.send(body as object);
  };

  const ok: TestApi['ok'] = async (method, path, body, status) => {
    const response = await call(method, path, body);
    const expected = status ?? (method === 'post' ? [200, 201] : [200]);
    if (![expected].flat().includes(response.status)) {
      throw new Error(`${method.toUpperCase()} ${path} → ${response.status}: ${JSON.stringify(response.body)}`);
    }
    return response.body;
  };

  return { http, prisma, clock, adminToken, call, ok, login, close: () => app.close() };
}

/** Cenário base criado pela própria API: corretor, proprietário, cliente e um imóvel para venda e locação. */
export async function seedViaApi(api: TestApi) {
  const broker = await api.ok('post', '/users', {
    name: 'Carla Corretora',
    email: 'carla@teste.com.br',
    password: 'senha-de-teste-1',
    role: 'BROKER',
    creci: '12345-F',
  });
  const owner = await api.ok('post', '/people', { name: 'Otávio Proprietário', document: cpf(1), phone: '(41) 3333-0000' });
  const client = await api.ok('post', '/people', { name: 'Clara Cliente', document: cpf(2), email: 'clara@exemplo.com' });
  const property = await api.ok('post', '/properties', {
    ownerId: owner.id,
    listingBrokerId: broker.id,
    title: 'Apartamento 2 quartos no Centro',
    type: 'APARTMENT',
    purpose: 'BOTH',
    salePriceCents: 450_000_00,
    rentPriceCents: 2_000_00,
    condoFeeCents: 450_00,
    bedrooms: 2,
    bathrooms: 1,
    areaM2: 68.5,
    address: { street: 'Rua das Flores', number: '100', complement: 'Ap 42', district: 'Centro', city: 'Curitiba', state: 'PR', zipCode: '80010-000' },
  });
  return { broker, owner, client, property };
}
