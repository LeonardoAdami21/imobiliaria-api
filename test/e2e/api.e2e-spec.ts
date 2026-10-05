import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cpf } from '@/shared/testing/in-memory-app';
import { Person } from '@/modules/crm/domain/person';
import { PrismaPersonRepository } from '@/modules/crm/infra/prisma-repositories';
import { PrismaContext } from '@/shared/infra/database/prisma';
import { seedViaApi, startTestApi, type TestApi } from './support';

describe('API: autenticação, permissões e cadastros', () => {
  let api: TestApi;
  let seed: Awaited<ReturnType<typeof seedViaApi>>;
  let brokerToken: string;

  beforeAll(async () => {
    api = await startTestApi();
    seed = await seedViaApi(api);
    brokerToken = await api.login('carla@teste.com.br', 'senha-de-teste-1');
  });

  afterAll(() => api.close());

  it('responde ao health check e publica a documentação sem autenticação', async () => {
    const health = await request(api.http).get('/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');

    const docs = await request(api.http).get('/docs.json');
    expect(docs.body.openapi).toBe('3.0.0');
    expect(docs.body.paths['/leases'].post.requestBody).toBeDefined();
    expect(docs.body.paths['/properties/{id}'].get.parameters[0]).toMatchObject({ name: 'id', in: 'path', required: true });
  });

  it('recusa requisição sem token, com token inválido e com senha errada', async () => {
    expect((await request(api.http).get('/properties')).status).toBe(401);
    expect((await api.call('get', '/properties', undefined, 'token-invalido')).status).toBe(401);

    const login = await request(api.http).post('/auth/login').send({ email: 'admin@teste.com.br', password: 'errada' });
    expect(login.status).toBe(401);
    expect(login.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('devolve os dados do usuário autenticado, sem a senha', async () => {
    const me = await api.call('get', '/auth/me', undefined, brokerToken);
    expect(me.body).toMatchObject({ email: 'carla@teste.com.br', role: 'BROKER', creci: '12345-F' });
    expect(JSON.stringify(me.body)).not.toContain('assword');
  });

  it('aplica as permissões por papel', async () => {
    const newUser = { name: 'Novo', email: 'novo@teste.com.br', password: 'senha-de-teste-1', role: 'FINANCE' };
    expect((await api.call('post', '/users', newUser, brokerToken)).status).toBe(403);
    expect((await api.call('get', '/users', undefined, brokerToken)).status).toBe(403);
    expect((await api.call('post', `/charges/${seed.property.id}/pay`, {}, brokerToken)).status).toBe(403);
    expect((await api.call('get', '/properties', undefined, brokerToken)).status).toBe(200);
  });

  it('token de usuário desativado deixa de valer imediatamente', async () => {
    const finance = await api.ok('post', '/users', { name: 'Fernanda', email: 'fe@teste.com.br', password: 'senha-de-teste-1', role: 'FINANCE' });
    const token = await api.login('fe@teste.com.br', 'senha-de-teste-1');
    expect((await api.call('get', '/auth/me', undefined, token)).status).toBe(200);

    await api.ok('patch', `/users/${finance.id}`, { active: false });
    expect((await api.call('get', '/auth/me', undefined, token)).status).toBe(401);
  });

  it('valida a entrada e explica o erro em português', async () => {
    const invalid = await api.call('post', '/people', { name: 'A', document: '123' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_REQUEST');
    expect(invalid.body.error.details.map((detail: { field: string }) => detail.field)).toEqual(['name', 'document']);

    const badCpf = await api.call('post', '/people', { name: 'Ana', document: '123.456.789-00' });
    expect(badCpf.status).toBe(400);
    expect(badCpf.body.error).toEqual({ code: 'INVALID_DOCUMENT', message: 'CPF inválido.' });

    const duplicate = await api.call('post', '/people', { name: 'Outro', document: cpf(1) });
    expect(duplicate.status).toBe(409);

    expect((await api.call('get', '/people/nao-e-uuid')).status).toBe(400);
    expect((await api.call('get', '/people/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await api.call('get', '/rota-que-nao-existe')).status).toBe(404);

    const brokenJson = await request(api.http)
      .post('/people')
      .set('Authorization', `Bearer ${api.adminToken}`)
      .set('Content-Type', 'application/json')
      .send('{ "name": ');
    expect(brokenJson.status).toBe(400);
    expect(brokenJson.body.error.code).toBe('INVALID_JSON');
  });

  it('grava e lê o imóvel completo no PostgreSQL, com fotos na ordem', async () => {
    const id = seed.property.id;
    await api.ok('post', `/properties/${id}/photos`, { url: 'https://cdn.exemplo.com/sala.jpg', caption: 'Sala' });
    const withPhotos = await api.ok('post', `/properties/${id}/photos`, { url: 'https://cdn.exemplo.com/quarto.jpg' });
    const [sala, quarto] = withPhotos.photos;
    await api.ok('put', `/properties/${id}/photos/order`, { photoIds: [quarto.id, sala.id] });

    const property = await api.ok('get', `/properties/${id}`);
    expect(property).toMatchObject({
      code: 1,
      status: 'AVAILABLE',
      salePriceCents: 450_000_00,
      rentPriceCents: 2_000_00,
      condoFeeCents: 450_00,
      propertyTaxCents: null,
      areaM2: 68.5,
      address: { complement: 'Ap 42', state: 'PR', zipCode: '80010000' },
    });
    expect(property.photos.map((photo: { caption: string | null }) => photo.caption)).toEqual([null, 'Sala']);

    const afterRemoval = await api.ok('delete', `/properties/${id}/photos/${quarto.id}`);
    expect(afterRemoval.photos).toHaveLength(1);
  });

  it('busca imóveis com filtros e paginação', async () => {
    await api.ok('post', '/properties', {
      ownerId: seed.owner.id,
      title: 'Casa com quintal',
      type: 'HOUSE',
      purpose: 'SALE',
      salePriceCents: 800_000_00,
      bedrooms: 3,
      address: { street: 'Rua do Sol', number: '55', district: 'Batel', city: 'Curitiba', state: 'PR', zipCode: '80420000' },
    });
    const codes = async (query: string) => (await api.ok('get', `/properties?${query}`)).items.map((item: { code: number }) => item.code);

    expect(await codes('purpose=RENT')).toEqual([1]);
    expect(await codes('purpose=SALE')).toEqual([2, 1]);
    expect(await codes('purpose=SALE&minPriceCents=50000000')).toEqual([2]);
    expect(await codes('purpose=RENT&maxPriceCents=250000')).toEqual([1]);
    expect(await codes('search=QUINTAL')).toEqual([2]);
    expect(await codes('search=flores')).toEqual([1]);
    expect(await codes('search=1')).toEqual([1]); // pelo código do imóvel
    expect(await codes('city=curitiba&district=bat')).toEqual([2]);
    expect(await codes('minBedrooms=3')).toEqual([2]);

    const page = await api.ok('get', '/properties?perPage=1&page=2');
    expect(page).toMatchObject({ total: 2, page: 2, perPage: 1 });
    expect(page.items).toHaveLength(1);
  });

  it('percorre o funil do CRM: lead, visita e conflito de agenda', async () => {
    const lead = await api.ok('post', '/leads', {
      name: 'Lia Lead',
      phone: '(41) 99999-0000',
      interest: 'RENT',
      source: 'PORTAL',
      propertyId: seed.property.id,
    });
    expect(lead).toMatchObject({ status: 'NEW', phone: '41999990000' });

    const visit = await api.ok('post', '/visits', {
      leadId: lead.id,
      propertyId: seed.property.id,
      brokerId: seed.broker.id,
      scheduledAt: '2026-03-12T14:00:00-03:00',
    });
    expect(visit).toMatchObject({ status: 'SCHEDULED', scheduledAt: '2026-03-12T17:00:00.000Z' });
    expect(await api.ok('get', `/leads/${lead.id}`)).toMatchObject({ status: 'VISIT_SCHEDULED', brokerId: seed.broker.id });

    const conflict = await api.call('post', '/visits', {
      leadId: lead.id,
      propertyId: seed.property.id,
      brokerId: seed.broker.id,
      scheduledAt: '2026-03-12T14:30:00-03:00',
    });
    expect(conflict.status).toBe(409);

    await api.ok('post', `/visits/${visit.id}/finish`, { outcome: 'DONE', feedback: 'Gostou do imóvel' });
    const agenda = await api.ok('get', `/visits?brokerId=${seed.broker.id}&status=DONE`);
    expect(agenda.total).toBe(1);

    const won = await api.ok('post', `/leads/${lead.id}/status`, { status: 'WON', personId: seed.client.id });
    expect(won).toMatchObject({ status: 'WON', personId: seed.client.id });
    expect((await api.ok('get', '/leads?status=WON')).total).toBe(1);
    expect((await api.ok('get', '/leads?unassigned=true')).total).toBe(0);
  });

  it('carteira do corretor: o corretor só enxerga os próprios leads', async () => {
    const other = await api.ok('post', '/leads', { name: 'Sem Dono', phone: '(41) 99999-0001', interest: 'BUY', source: 'PORTAL' });

    const mine = await api.call('post', '/leads', { name: 'Da Carla', phone: '(41) 99999-0002', interest: 'RENT', source: 'WALK_IN' }, brokerToken);
    expect(mine.status).toBe(201);
    expect(mine.body).toMatchObject({ brokerId: seed.broker.id, status: 'IN_SERVICE' });

    const list = await api.call('get', '/leads?perPage=100', undefined, brokerToken);
    const ids = list.body.items.map((lead: { id: string }) => lead.id);
    expect(ids).toContain(mine.body.id);
    expect(ids).not.toContain(other.id);
    expect(list.body.items.every((lead: { brokerId: string }) => lead.brokerId === seed.broker.id)).toBe(true);
    expect((await api.call('get', `/leads/${other.id}`, undefined, brokerToken)).status).toBe(404);

    // O administrador continua vendo todos.
    const all = (await api.ok('get', '/leads?perPage=100')).items.map((lead: { id: string }) => lead.id);
    expect(all).toEqual(expect.arrayContaining([mine.body.id, other.id]));
  });

  it('unidade de trabalho: se algo falha no meio, o que já foi salvo é desfeito', async () => {
    const db = new PrismaContext(api.prisma);
    const people = new PrismaPersonRepository(db);

    const failing = db.run(async () => {
      await people.save(Person.create({ name: 'Pessoa Temporária', document: cpf(99) }));
      expect(await people.findByDocument(cpf(99))).not.toBeNull(); // visível dentro da transação
      throw new Error('falha depois de salvar');
    });

    await expect(failing).rejects.toThrow('falha depois de salvar');
    expect(await people.findByDocument(cpf(99))).toBeNull();
  });
});
