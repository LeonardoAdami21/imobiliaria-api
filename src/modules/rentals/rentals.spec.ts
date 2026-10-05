import { beforeEach, describe, expect, it } from 'vitest';
import { buildInMemoryApp, cpf, type InMemoryApp, seedBasics } from '@/shared/testing/in-memory-app';
import { dateOnly } from '@/shared/domain/dates';
import { BusinessRuleError } from '@/shared/domain/errors';

describe('Locação', () => {
  let app: InMemoryApp;
  let seed: Awaited<ReturnType<typeof seedBasics>>;

  /** Contrato padrão dos testes: aluguel de R$ 2.000,00, vencimento dia 5, início em 15/01/2026. */
  const lease = (overrides: Record<string, unknown> = {}) => ({
    propertyId: seed.property.id,
    tenantId: seed.client.id,
    startDate: dateOnly('2026-01-15'),
    durationMonths: 12,
    rentAmountCents: 2_000_00,
    dueDay: 5,
    adminFeePercent: 10,
    lateFeePercent: 10,
    monthlyInterestPercent: 1,
    guaranteeType: 'NONE' as const,
    adjustmentIndex: 'IPCA' as const,
    ...overrides,
  });

  const chargesOf = (leaseId: string, filters: Record<string, unknown> = {}) =>
    app.rentals.searchCharges.execute({ page: 1, perPage: 100, leaseId, ...filters }).then((page) => page.items);

  beforeEach(async () => {
    app = await buildInMemoryApp('2026-03-10T12:00:00Z');
    seed = await seedBasics(app);
  });

  describe('Criação do contrato', () => {
    it('gera uma cobrança por mês, marca o imóvel como alugado e calcula o fim do prazo', async () => {
      const created = await app.rentals.createLease.execute(lease());
      const charges = await chargesOf(created.id);

      expect(created).toMatchObject({ status: 'ACTIVE', ownerId: seed.owner.id, startDate: '2026-01-15', endDate: '2027-01-14' });
      expect(charges).toHaveLength(12);
      expect(charges[0]).toMatchObject({ referenceMonth: '2026-01', dueDate: '2026-02-05', amountCents: 2_000_00, status: 'PENDING' });
      expect(charges[11]).toMatchObject({ referenceMonth: '2026-12', dueDate: '2027-01-05' });
      expect((await app.properties.getProperty.execute({ id: seed.property.id })).status).toBe('RENTED');
    });

    it('não aluga imóvel já alugado nem imóvel anunciado só para venda', async () => {
      await app.rentals.createLease.execute(lease());
      const otherTenant = await app.crm.registerPerson.execute({ name: 'Outro Inquilino', document: cpf(3) });
      await expect(app.rentals.createLease.execute(lease({ tenantId: otherTenant.id }))).rejects.toThrow(BusinessRuleError);

      const saleOnly = await app.properties.registerProperty.execute({
        ownerId: seed.owner.id,
        title: 'Terreno',
        type: 'LAND',
        purpose: 'SALE',
        salePriceCents: 100_000_00,
        address: { street: 'Rua B', number: '2', district: 'Centro', city: 'Curitiba', state: 'PR', zipCode: '80010000' },
      });
      await expect(app.rentals.createLease.execute(lease({ propertyId: saleOnly.id }))).rejects.toThrow('locação');
      expect(app.repos.leases.items).toHaveLength(1);
    });

    it('o inquilino não pode ser o proprietário', async () => {
      await expect(app.rentals.createLease.execute(lease({ tenantId: seed.owner.id }))).rejects.toThrow(BusinessRuleError);
    });

    it('fiador é obrigatório na garantia por fiador e não pode ser o inquilino', async () => {
      const guarantor = await app.crm.registerPerson.execute({ name: 'Fábio Fiador', document: cpf(4) });

      await expect(app.rentals.createLease.execute(lease({ guaranteeType: 'GUARANTOR' }))).rejects.toThrow('fiador');
      await expect(
        app.rentals.createLease.execute(lease({ guaranteeType: 'GUARANTOR', guarantorId: seed.client.id })),
      ).rejects.toThrow(BusinessRuleError);

      const created = await app.rentals.createLease.execute(lease({ guaranteeType: 'GUARANTOR', guarantorId: guarantor.id }));
      expect(created.guarantorId).toBe(guarantor.id);
    });

    it('caução é limitada a três meses de aluguel', async () => {
      const deposit = (depositAmountCents: number) => lease({ guaranteeType: 'DEPOSIT', depositAmountCents });

      await expect(app.rentals.createLease.execute(deposit(6_000_01))).rejects.toThrow('3 meses');
      await expect(app.rentals.createLease.execute(deposit(6_000_00))).resolves.toMatchObject({ depositAmountCents: 6_000_00 });
    });
  });

  describe('Pagamento e repasse', () => {
    it('pagamento em dia: sem encargos, desconta a taxa de administração do repasse', async () => {
      const created = await app.rentals.createLease.execute(lease());
      const [first] = await chargesOf(created.id);

      const paid = await app.rentals.payCharge.execute({ id: first!.id, paidAt: dateOnly('2026-02-05') });

      expect(paid).toMatchObject({ status: 'PAID', overdue: false });
      expect(paid.payment).toMatchObject({
        lateFeeCents: 0,
        interestCents: 0,
        paidAmountCents: 2_000_00,
        adminFeeCents: 200_00,
        ownerTransferCents: 1_800_00,
        transferStatus: 'PENDING',
      });
    });

    it('pagamento com 15 dias de atraso: multa de 10% e juros de 1% ao mês proporcionais', async () => {
      const created = await app.rentals.createLease.execute(lease());
      const [, second] = await chargesOf(created.id); // competência 02/2026, vence em 05/03/2026

      app.clock.set('2026-03-20T12:00:00Z');
      const quote = await app.rentals.quoteCharge.execute({ id: second!.id });
      expect(quote).toMatchObject({ daysLate: 15, lateFeeCents: 200_00, interestCents: 10_00, totalCents: 2_210_00 });

      const paid = await app.rentals.payCharge.execute({ id: second!.id });
      expect(paid.payment).toMatchObject({
        paidAt: '2026-03-20',
        paidAmountCents: 2_210_00,
        adminFeeCents: 221_00,
        ownerTransferCents: 1_989_00,
      });
    });

    it('não paga duas vezes nem com data futura', async () => {
      const created = await app.rentals.createLease.execute(lease());
      const [first] = await chargesOf(created.id);

      await expect(app.rentals.payCharge.execute({ id: first!.id, paidAt: dateOnly('2026-03-11') })).rejects.toThrow('futuro');
      await app.rentals.payCharge.execute({ id: first!.id });
      await expect(app.rentals.payCharge.execute({ id: first!.id })).rejects.toThrow(BusinessRuleError);
    });

    it('lista as atrasadas com base na data de hoje', async () => {
      const created = await app.rentals.createLease.execute(lease());

      // Em 10/03/2026 já venceram as cobranças de 05/02 e 05/03.
      const overdue = await chargesOf(created.id, { overdue: true });
      expect(overdue.map((charge) => charge.dueDate)).toEqual(['2026-02-05', '2026-03-05']);
      expect(overdue.every((charge) => charge.overdue)).toBe(true);
    });

    it('repasse só depois do pagamento, e uma única vez', async () => {
      const created = await app.rentals.createLease.execute(lease());
      const [first] = await chargesOf(created.id);

      await expect(app.rentals.registerOwnerTransfer.execute({ id: first!.id })).rejects.toThrow('já paga');
      await app.rentals.payCharge.execute({ id: first!.id });

      const transferred = await app.rentals.registerOwnerTransfer.execute({ id: first!.id });
      expect(transferred.payment).toMatchObject({ transferStatus: 'DONE', transferredAt: '2026-03-10' });
      await expect(app.rentals.registerOwnerTransfer.execute({ id: first!.id })).rejects.toThrow('já foi realizado');

      const pendingTransfers = await chargesOf(created.id, { transferStatus: 'PENDING' });
      expect(pendingTransfers).toHaveLength(0);
    });
  });

  describe('Reajuste anual', () => {
    it('só permite reajustar depois de 12 meses', async () => {
      const created = await app.rentals.createLease.execute(lease({ durationMonths: 30 }));
      expect(created.nextAdjustmentDate).toBe('2027-01-15');

      await expect(
        app.rentals.adjustRent.execute({ id: created.id, percent: 5, effectiveFrom: dateOnly('2026-12-01') }),
      ).rejects.toThrow('12 meses');
    });

    it('muda o aluguel e as cobranças pendentes a partir do mês de vigência', async () => {
      const created = await app.rentals.createLease.execute(lease({ durationMonths: 30 }));

      app.clock.set('2027-01-15T12:00:00Z');
      const adjusted = await app.rentals.adjustRent.execute({ id: created.id, percent: 5 });
      expect(adjusted).toMatchObject({ rentAmountCents: 2_100_00, lastAdjustmentAt: '2027-01-15', nextAdjustmentDate: '2028-01-15' });

      const charges = await chargesOf(created.id);
      const amountOf = (month: string) => charges.find((charge) => charge.referenceMonth === month)!.amountCents;
      expect(amountOf('2026-12')).toBe(2_000_00);
      expect(amountOf('2027-01')).toBe(2_100_00);
      expect(amountOf('2028-06')).toBe(2_100_00);

      await expect(app.rentals.adjustRent.execute({ id: created.id, percent: 5 })).rejects.toThrow('12 meses');
    });
  });

  describe('Encerramento', () => {
    it('rescisão antecipada exige motivo, cancela as cobranças futuras e libera o imóvel', async () => {
      const created = await app.rentals.createLease.execute(lease());
      app.clock.set('2026-06-20T12:00:00Z');

      await expect(app.rentals.closeLease.execute({ id: created.id })).rejects.toThrow('motivo');

      const closed = await app.rentals.closeLease.execute({ id: created.id, reason: 'Inquilino transferido de cidade' });
      expect(closed).toMatchObject({ status: 'TERMINATED', terminatedAt: '2026-06-20' });

      const charges = await chargesOf(created.id);
      const statusOf = (month: string) => charges.find((charge) => charge.referenceMonth === month)!.status;
      expect(statusOf('2026-06')).toBe('PENDING'); // o mês da saída continua devido
      expect(statusOf('2026-07')).toBe('CANCELED');
      expect(charges.filter((charge) => charge.status === 'CANCELED')).toHaveLength(6);
      expect((await app.properties.getProperty.execute({ id: seed.property.id })).status).toBe('AVAILABLE');
    });

    it('encerramento no fim do prazo não é rescisão', async () => {
      const created = await app.rentals.createLease.execute(lease());
      app.clock.set('2027-01-14T12:00:00Z');

      const closed = await app.rentals.closeLease.execute({ id: created.id });
      expect(closed).toMatchObject({ status: 'ENDED', terminationReason: null });
      await expect(app.rentals.closeLease.execute({ id: created.id })).rejects.toThrow('contrato ativo');
    });
  });
});
