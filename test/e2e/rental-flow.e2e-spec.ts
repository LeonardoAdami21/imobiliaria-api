import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedViaApi, startTestApi, type TestApi } from './support';

describe('API: ciclo completo de uma locação', () => {
  let api: TestApi;
  let seed: Awaited<ReturnType<typeof seedViaApi>>;
  let leaseId: string;

  const charges = async (query = '') => (await api.ok('get', `/charges?leaseId=${leaseId}&perPage=100${query}`)).items;
  const propertyStatus = async () => (await api.ok('get', `/properties/${seed.property.id}`)).status;

  beforeAll(async () => {
    api = await startTestApi('2026-03-10T12:00:00Z');
    seed = await seedViaApi(api);
  });

  afterAll(() => api.close());

  it('cria o contrato com os valores padrão, as cobranças e marca o imóvel como alugado', async () => {
    const lease = await api.ok('post', '/leases', {
      propertyId: seed.property.id,
      tenantId: seed.client.id,
      startDate: '2026-01-15',
      rentAmountCents: 2_000_00,
      dueDay: 5,
      guaranteeType: 'DEPOSIT',
      depositAmountCents: 6_000_00,
    });
    leaseId = lease.id;

    expect(lease).toMatchObject({
      status: 'ACTIVE',
      ownerId: seed.owner.id,
      startDate: '2026-01-15',
      endDate: '2028-07-14',
      durationMonths: 30,
      rentAmountCents: 2_000_00,
      adminFeePercent: 10,
      lateFeePercent: 10,
      monthlyInterestPercent: 1,
      depositAmountCents: 6_000_00,
      adjustmentIndex: 'IPCA',
      nextAdjustmentDate: '2027-01-15',
    });
    expect(await propertyStatus()).toBe('RENTED');

    const all = await charges();
    expect(all).toHaveLength(30);
    expect(all[0]).toMatchObject({ referenceMonth: '2026-01', dueDate: '2026-02-05', amountCents: 2_000_00, overdue: true });
    expect(all[29]).toMatchObject({ referenceMonth: '2028-06', dueDate: '2028-07-05', overdue: false });
  });

  it('contrato para imóvel já alugado é recusado e nada é gravado', async () => {
    const before = await api.prisma.lease.count();
    const second = await api.call('post', '/leases', {
      propertyId: seed.property.id,
      tenantId: seed.client.id,
      startDate: '2026-02-01',
      rentAmountCents: 2_000_00,
      dueDay: 5,
      guaranteeType: 'NONE',
    });

    expect(second.status).toBe(422);
    expect(second.body.error.code).toBe('INVALID_PROPERTY_STATUS');
    expect(await api.prisma.lease.count()).toBe(before);
    expect(await api.prisma.rentCharge.count()).toBe(30);
  });

  it('caução acima de três aluguéis é recusada', async () => {
    const response = await api.call('post', '/leases', {
      propertyId: seed.property.id,
      tenantId: seed.client.id,
      startDate: '2026-02-01',
      rentAmountCents: 2_000_00,
      dueDay: 5,
      guaranteeType: 'DEPOSIT',
      depositAmountCents: 6_000_01,
    });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('DEPOSIT_ABOVE_LEGAL_LIMIT');
  });

  it('lista as cobranças atrasadas e calcula o valor atualizado', async () => {
    const overdue = await charges('&overdue=true');
    expect(overdue.map((charge: { dueDate: string }) => charge.dueDate)).toEqual(['2026-02-05', '2026-03-05']);

    const quote = await api.ok('get', `/charges/${overdue[1].id}/quote?date=2026-03-20`);
    expect(quote).toMatchObject({ daysLate: 15, lateFeeCents: 200_00, interestCents: 10_00, totalCents: 2_210_00 });
  });

  it('dá baixa em pagamento atrasado, com multa, juros, taxa de administração e repasse', async () => {
    const [first] = await charges();

    // Venceu em 05/02 e é paga em 10/03: 33 dias de atraso.
    const paid = await api.ok('post', `/charges/${first.id}/pay`, {});
    expect(paid).toMatchObject({ status: 'PAID', overdue: false });
    expect(paid.payment).toEqual({
      paidAt: '2026-03-10',
      lateFeeCents: 200_00,
      interestCents: 22_00,
      paidAmountCents: 2_222_00,
      adminFeeCents: 222_20,
      ownerTransferCents: 1_999_80,
      transferStatus: 'PENDING',
      transferredAt: null,
    });

    expect((await api.call('post', `/charges/${first.id}/pay`, {})).status).toBe(422);

    const transferred = await api.ok('post', `/charges/${first.id}/transfer`, { date: '2026-03-10' });
    expect(transferred.payment).toMatchObject({ transferStatus: 'DONE', transferredAt: '2026-03-10' });
    expect(await charges('&transferStatus=PENDING')).toHaveLength(0);
    expect(await charges('&status=PAID')).toHaveLength(1);
  });

  it('aplica o reajuste anual só depois de 12 meses e atualiza as cobranças futuras', async () => {
    const early = await api.call('post', `/leases/${leaseId}/adjust-rent`, { percent: 4.5 });
    expect(early.status).toBe(422);
    expect(early.body.error.code).toBe('ADJUSTMENT_BEFORE_ANNIVERSARY');

    api.clock.set('2027-01-15T12:00:00Z');
    const adjusted = await api.ok('post', `/leases/${leaseId}/adjust-rent`, { percent: 4.5 });
    expect(adjusted).toMatchObject({ rentAmountCents: 2_090_00, lastAdjustmentAt: '2027-01-15', nextAdjustmentDate: '2028-01-15' });

    const all = await charges();
    const amountOf = (month: string) => all.find((charge: { referenceMonth: string }) => charge.referenceMonth === month).amountCents;
    expect(amountOf('2026-01')).toBe(2_000_00); // já paga, não muda
    expect(amountOf('2026-12')).toBe(2_000_00); // anterior à vigência
    expect(amountOf('2027-01')).toBe(2_090_00);
    expect(amountOf('2028-06')).toBe(2_090_00);
  });

  it('rescinde o contrato, cancela as cobranças futuras e libera o imóvel', async () => {
    api.clock.set('2027-03-20T12:00:00Z');
    expect((await api.call('post', `/leases/${leaseId}/close`, {})).status).toBe(422);

    const closed = await api.ok('post', `/leases/${leaseId}/close`, { reason: 'Inquilino comprou imóvel próprio' });
    expect(closed).toMatchObject({ status: 'TERMINATED', terminatedAt: '2027-03-20', terminationReason: 'Inquilino comprou imóvel próprio' });
    expect(await propertyStatus()).toBe('AVAILABLE');

    expect(await charges('&status=CANCELED')).toHaveLength(15); // 04/2027 a 06/2028
    expect(await charges('&status=PENDING')).toHaveLength(14); // 02/2026 a 03/2027
    expect((await api.ok('get', '/leases?status=TERMINATED')).total).toBe(1);
  });
});
