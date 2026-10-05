import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cpf } from '@/shared/testing/in-memory-app';
import { seedViaApi, startTestApi, type TestApi } from './support';

describe('API: ciclo completo de uma venda', () => {
  let api: TestApi;
  let seed: Awaited<ReturnType<typeof seedViaApi>>;
  let brokerToken: string;
  let winnerId: string;
  let loserId: string;
  let sale: any;

  const propertyStatus = async () => (await api.ok('get', `/properties/${seed.property.id}`)).status;

  beforeAll(async () => {
    api = await startTestApi('2026-03-10T12:00:00Z');
    seed = await seedViaApi(api);
    brokerToken = await api.login('carla@teste.com.br', 'senha-de-teste-1');
  });

  afterAll(() => api.close());

  it('o corretor registra propostas em seu nome, mas não pode aceitá-las', async () => {
    const otherBuyer = await api.ok('post', '/people', { name: 'Bruno Comprador', document: cpf(5) });

    const winner = await api.call(
      'post',
      '/proposals',
      { propertyId: seed.property.id, buyerId: seed.client.id, amountCents: 430_000_00, paymentTerms: '30% de entrada', validUntil: '2026-03-31' },
      brokerToken,
    );
    expect(winner.status).toBe(201);
    expect(winner.body).toMatchObject({ status: 'PENDING', brokerId: seed.broker.id, amountCents: 430_000_00, validUntil: '2026-03-31' });
    winnerId = winner.body.id;

    loserId = (await api.ok('post', '/proposals', { propertyId: seed.property.id, buyerId: otherBuyer.id, brokerId: seed.broker.id, amountCents: 420_000_00 })).id;

    expect((await api.call('post', `/proposals/${winnerId}/accept`, undefined, brokerToken)).status).toBe(403);
  });

  it('aceitar reserva o imóvel; desistir libera; aceitar de novo exige nova proposta', async () => {
    await api.ok('post', `/proposals/${winnerId}/accept`);
    expect(await propertyStatus()).toBe('RESERVED');

    const second = await api.call('post', `/proposals/${loserId}/accept`);
    expect(second.status).toBe(422);
    expect((await api.ok('get', `/proposals/${loserId}`)).status).toBe('PENDING');

    await api.ok('post', `/proposals/${winnerId}/cancel`);
    expect(await propertyStatus()).toBe('AVAILABLE');
    expect((await api.call('post', `/proposals/${winnerId}/accept`)).status).toBe(422);

    winnerId = (await api.ok('post', '/proposals', { propertyId: seed.property.id, buyerId: seed.client.id, brokerId: seed.broker.id, amountCents: 430_000_00 })).id;
    await api.ok('post', `/proposals/${winnerId}/accept`);
    expect(await propertyStatus()).toBe('RESERVED');
  });

  it('fecha a venda, divide a comissão e recusa a proposta concorrente', async () => {
    sale = await api.ok('post', '/sales', { proposalId: winnerId, sellingBrokerSharePercent: 30, listingBrokerSharePercent: 20 });

    expect(sale).toMatchObject({
      propertyId: seed.property.id,
      buyerId: seed.client.id,
      sellerId: seed.owner.id,
      amountCents: 430_000_00,
      commissionPercent: 6,
      commissionAmountCents: 25_800_00,
      closedAt: '2026-03-10',
    });
    const byRole = Object.fromEntries(sale.commissions.map((commission: any) => [commission.role, commission]));
    expect(byRole.LISTING_BROKER).toMatchObject({ brokerId: seed.broker.id, sharePercent: 20, amountCents: 5_160_00, status: 'PENDING' });
    expect(byRole.SELLING_BROKER).toMatchObject({ brokerId: seed.broker.id, sharePercent: 30, amountCents: 7_740_00 });
    expect(byRole.AGENCY).toMatchObject({ brokerId: null, sharePercent: 50, amountCents: 12_900_00 });

    expect(await propertyStatus()).toBe('SOLD');
    expect(await api.ok('get', `/proposals/${loserId}`)).toMatchObject({ status: 'REJECTED', rejectionReason: 'Imóvel vendido para outro comprador.' });

    // A mesma proposta não gera duas vendas, e imóvel vendido não recebe proposta nem alteração.
    expect((await api.call('post', '/sales', { proposalId: winnerId, sellingBrokerSharePercent: 30 })).status).toBe(422);
    expect((await api.call('post', `/proposals/${winnerId}/cancel`)).status).toBe(422);
    expect((await api.call('patch', `/properties/${seed.property.id}`, { title: 'Novo título' })).status).toBe(422);
    expect(await api.prisma.sale.count()).toBe(1);
  });

  it('o corretor vê apenas as próprias comissões; o financeiro paga', async () => {
    const mine = await api.call('get', '/commissions', undefined, brokerToken);
    expect(mine.body).toMatchObject({ total: 2, totalAmountCents: 12_900_00 });

    const all = await api.ok('get', '/commissions');
    expect(all).toMatchObject({ total: 3, totalAmountCents: 25_800_00 });

    const commission = sale.commissions.find((item: any) => item.role === 'SELLING_BROKER');
    expect((await api.call('post', `/sales/${sale.id}/commissions/${commission.id}/pay`, {}, brokerToken)).status).toBe(403);

    const paid = await api.ok('post', `/sales/${sale.id}/commissions/${commission.id}/pay`, { paidAt: '2026-03-10' });
    expect(paid.commissions.find((item: any) => item.id === commission.id)).toMatchObject({ status: 'PAID', paidAt: '2026-03-10' });
    expect((await api.call('post', `/sales/${sale.id}/commissions/${commission.id}/pay`, {})).status).toBe(422);

    const pending = await api.ok('get', `/commissions?status=PENDING&closedFrom=2026-03-01&closedTo=2026-03-31`);
    expect(pending).toMatchObject({ total: 2, totalAmountCents: 18_060_00 });
    expect((await api.ok('get', '/sales?closedFrom=2026-04-01')).total).toBe(0);
    expect((await api.ok('get', `/sales/${sale.id}`)).commissions).toHaveLength(3);
  });
});
