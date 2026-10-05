import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from './app.setup';
import { EnsureAdminUser } from './modules/identity/application/user-use-cases';
import { buildInMemoryModule, cpf, TEST_ENV } from './shared/testing/in-memory-app';

/**
 * Camada HTTP do NestJS (guard, papéis, validação, filtro de erros, códigos de status e Swagger)
 * rodando sobre os repositórios em memória. Os testes de ponta a ponta repetem isso com PostgreSQL.
 */
describe('HTTP', () => {
  let app: INestApplication;
  let http: Server;
  let adminToken: string;
  let brokerToken: string;

  const call = (method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, token?: string) => {
    const pending = request(http)[method](path);
    return token ? pending.set('Authorization', `Bearer ${token}`) : pending;
  };

  beforeAll(async () => {
    const { moduleRef } = await buildInMemoryModule();
    const nest = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(nest, TEST_ENV);
    await nest.init();
    app = nest;
    http = app.getHttpServer() as Server;

    const admin = { name: 'Ana Admin', email: 'ana@imob.com.br', password: 'senha-forte-1' };
    await moduleRef.get(EnsureAdminUser).execute(admin);
    adminToken = (await call('post', '/auth/login').send({ email: admin.email, password: admin.password })).body.token;

    const broker = await call('post', '/users', adminToken).send({
      name: 'Carla Corretora',
      email: 'carla@imob.com.br',
      password: 'senha-forte-1',
      role: 'BROKER',
      creci: '12345-F',
    });
    expect(broker.status).toBe(201);
    brokerToken = (await call('post', '/auth/login').send({ email: 'carla@imob.com.br', password: 'senha-forte-1' })).body.token;
  });

  afterAll(() => app.close());

  it('health check e documentação são públicos', async () => {
    const health = await call('get', '/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');

    const docs = await call('get', '/docs.json');
    expect(docs.status).toBe(200);
    expect(docs.body.paths['/leases'].post.requestBody).toBeDefined();
    expect(docs.body.paths['/leads/{id}/status'].post.requestBody).toBeDefined();
    expect(docs.body.paths['/properties/{id}'].get.parameters[0]).toMatchObject({ name: 'id', in: 'path', required: true });
    expect(docs.body.paths['/properties'].get.parameters.map((p: { name: string }) => p.name)).toContain('minBedrooms');

    // Exemplos legíveis no lugar do texto aleatório gerado a partir das regex do Zod.
    expect(docs.body.components.schemas.LoginDto.properties).toMatchObject({
      email: { example: 'admin@imobiliaria.com.br' },
      password: { example: 'TroqueEstaSenha123' },
    });
    expect(docs.body.components.schemas.RegisterPersonDto.properties.email.example).toBe('nome@imobiliaria.com.br');
    expect(docs.body.paths['/properties/{id}'].get.parameters[0].schema.example).toBe('3fa85f64-5717-4562-b3fc-2c963f66afa6');
    const withoutExample: string[] = [];
    (function walk(node: unknown): void {
      if (!node || typeof node !== 'object') return;
      const { format, example } = node as { format?: string; example?: unknown };
      if (['email', 'uuid', 'date', 'date-time'].includes(format ?? '') && example === undefined) withoutExample.push(format!);
      Object.values(node).forEach(walk);
    })(docs.body);
    expect(withoutExample).toEqual([]);
  });

  it('exige token, confere o papel antes de validar o corpo e responde no formato padrão', async () => {
    const anonymous = await call('get', '/properties');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('INVALID_TOKEN');
    expect((await call('get', '/properties', 'token-invalido')).status).toBe(401);

    const wrongPassword = await call('post', '/auth/login').send({ email: 'ana@imob.com.br', password: 'errada' });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');

    expect((await call('get', '/users', brokerToken)).status).toBe(403);
    // Corpo inválido, mas o papel é verificado primeiro.
    const forbidden = await call('post', '/charges/00000000-0000-4000-8000-000000000000/pay', brokerToken).send({ paidAt: 'x' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
    expect((await call('get', '/properties', brokerToken)).status).toBe(200);
  });

  it('valida params, query e corpo com Zod e explica o erro em português', async () => {
    const invalid = await call('post', '/people', adminToken).send({ name: 'A', document: '123' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_REQUEST');
    expect(invalid.body.error.details.map((detail: { field: string }) => detail.field)).toEqual(['name', 'document']);

    const badCpf = await call('post', '/people', adminToken).send({ name: 'Ana', document: '123.456.789-00' });
    expect(badCpf.status).toBe(400);
    expect(badCpf.body.error).toEqual({ code: 'INVALID_DOCUMENT', message: 'CPF inválido.' });

    expect((await call('get', '/people/nao-e-uuid', adminToken)).status).toBe(400);
    expect((await call('get', '/people?perPage=500', adminToken)).status).toBe(400);
    expect((await call('get', '/people/00000000-0000-4000-8000-000000000000', adminToken)).status).toBe(404);

    const unknownRoute = await call('get', '/rota-que-nao-existe', adminToken);
    expect(unknownRoute.status).toBe(404);
    expect(unknownRoute.body.error.code).toBe('ROUTE_NOT_FOUND');

    const brokenJson = await call('post', '/people', adminToken).set('Content-Type', 'application/json').send('{ "name": ');
    expect(brokenJson.status).toBe(400);
    expect(brokenJson.body.error.code).toBe('INVALID_JSON');

    const badStatus = await call('post', '/leads/00000000-0000-4000-8000-000000000000/status', adminToken).send({ status: 'LOST' });
    expect(badStatus.status).toBe(400);
    expect(badStatus.body.error.details[0].field).toBe('reason');
  });

  it('usa 201 ao criar, 200 nas ações e 204 sem conteúdo; query string chega convertida', async () => {
    const person = await call('post', '/people', adminToken).send({ name: 'Otávio', document: cpf(1) });
    expect(person.status).toBe(201);

    const lead = await call('post', '/leads', brokerToken).send({ name: 'Lia', phone: '41999990000', interest: 'BUY', source: 'PORTAL' });
    expect(lead.status).toBe(201);
    const lost = await call('post', `/leads/${lead.body.id}/status`, brokerToken).send({ status: 'LOST', reason: 'Desistiu' });
    expect(lost.status).toBe(200);
    expect(lost.body).toMatchObject({ status: 'LOST', lostReason: 'Desistiu' });

    const page = await call('get', '/leads?page=1&perPage=5&status=LOST', brokerToken);
    expect(page.body).toMatchObject({ total: 1, page: 1, perPage: 5 });

    const changed = await call('patch', '/auth/me/password', brokerToken).send({ currentPassword: 'senha-forte-1', newPassword: 'outra-senha-1' });
    expect(changed.status).toBe(204);
  });
});
