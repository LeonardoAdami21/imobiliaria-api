import { beforeEach, describe, expect, it } from 'vitest';
import { buildInMemoryApp, cpf, type InMemoryApp, seedBasics } from '@/shared/testing/in-memory-app';
import { dateOnly } from '@/shared/domain/dates';
import { BusinessRuleError } from '@/shared/domain/errors';
import { Money } from '@/shared/domain/money';
import { Sale } from './domain/sale';

describe('Vendas', () => {
  let app: InMemoryApp;
  let seed: Awaited<ReturnType<typeof seedBasics>>;

  const propose = (overrides: Record<string, unknown> = {}) =>
    app.sales.createProposal.execute({
      propertyId: seed.property.id,
      buyerId: seed.client.id,
      brokerId: seed.broker.id,
      amountCents: 430_000_00,
      ...overrides,
    });

  const propertyStatus = () => app.properties.getProperty.execute({ id: seed.property.id }).then((property) => property.status);

  beforeEach(async () => {
    app = await buildInMemoryApp('2026-03-10T12:00:00Z');
    seed = await seedBasics(app);
  });

  describe('Propostas', () => {
    it('o proprietário não pode comprar o próprio imóvel', async () => {
      await expect(propose({ buyerId: seed.owner.id })).rejects.toThrow(BusinessRuleError);
    });

    it('aceitar reserva o imóvel e bloqueia novas propostas', async () => {
      const proposal = await propose();
      const accepted = await app.sales.decideProposal.execute({ id: proposal.id, decision: 'ACCEPT' });

      expect(accepted.status).toBe('ACCEPTED');
      expect(await propertyStatus()).toBe('RESERVED');
      await expect(propose()).rejects.toThrow('imóvel disponível');
    });

    it('com o imóvel já reservado, uma segunda proposta não pode ser aceita e continua pendente', async () => {
      const otherBuyer = await app.crm.registerPerson.execute({ name: 'Bruno Comprador', document: cpf(5) });
      const first = await propose();
      const second = await propose({ buyerId: otherBuyer.id, amountCents: 440_000_00 });
      await app.sales.decideProposal.execute({ id: first.id, decision: 'ACCEPT' });

      await expect(app.sales.decideProposal.execute({ id: second.id, decision: 'ACCEPT' })).rejects.toThrow(BusinessRuleError);
      expect((await app.sales.getProposal.execute({ id: second.id })).status).toBe('PENDING');
    });

    it('proposta vencida não pode ser aceita', async () => {
      const proposal = await propose({ validUntil: dateOnly('2026-03-15') });
      app.clock.set('2026-03-16T12:00:00Z');

      await expect(app.sales.decideProposal.execute({ id: proposal.id, decision: 'ACCEPT' })).rejects.toThrow('validade');
    });

    it('desistência de proposta aceita devolve o imóvel ao mercado', async () => {
      const proposal = await propose();
      await app.sales.decideProposal.execute({ id: proposal.id, decision: 'ACCEPT' });

      const canceled = await app.sales.decideProposal.execute({ id: proposal.id, decision: 'CANCEL' });
      expect(canceled.status).toBe('CANCELED');
      expect(await propertyStatus()).toBe('AVAILABLE');
    });
  });

  describe('Fechamento e comissões', () => {
    const closing = (proposalId: string) => ({
      proposalId,
      commissionPercent: 6,
      sellingBrokerSharePercent: 30,
      listingBrokerSharePercent: 20,
    });

    it('só proposta aceita vira venda', async () => {
      const proposal = await propose();
      await expect(app.sales.closeSale.execute(closing(proposal.id))).rejects.toThrow('proposta aceita');
    });

    it('fecha a venda, divide a comissão, vende o imóvel e recusa as outras propostas', async () => {
      const otherBuyer = await app.crm.registerPerson.execute({ name: 'Bruno Comprador', document: cpf(5) });
      const winner = await propose();
      const loser = await propose({ buyerId: otherBuyer.id, amountCents: 420_000_00 });
      await app.sales.decideProposal.execute({ id: winner.id, decision: 'ACCEPT' });

      const sale = await app.sales.closeSale.execute(closing(winner.id));

      // 6% de R$ 430.000,00 = R$ 25.800,00: 20% captador, 30% vendedor, 50% imobiliária.
      expect(sale).toMatchObject({ amountCents: 430_000_00, commissionAmountCents: 25_800_00, sellerId: seed.owner.id, closedAt: '2026-03-10' });
      expect(sale.commissions.map(({ role, brokerId, amountCents }) => ({ role, brokerId, amountCents }))).toEqual([
        { role: 'LISTING_BROKER', brokerId: seed.broker.id, amountCents: 5_160_00 },
        { role: 'SELLING_BROKER', brokerId: seed.broker.id, amountCents: 7_740_00 },
        { role: 'AGENCY', brokerId: null, amountCents: 12_900_00 },
      ]);
      expect(await propertyStatus()).toBe('SOLD');
      expect(await app.sales.getProposal.execute({ id: loser.id })).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'Imóvel vendido para outro comprador.',
      });
      await expect(app.sales.decideProposal.execute({ id: winner.id, decision: 'CANCEL' })).rejects.toThrow('já virou uma venda');
    });

    it('relatório de comissões por corretor, e pagamento de comissão uma única vez', async () => {
      const proposal = await propose();
      await app.sales.decideProposal.execute({ id: proposal.id, decision: 'ACCEPT' });
      const sale = await app.sales.closeSale.execute(closing(proposal.id));

      const report = await app.sales.listCommissions.execute({ page: 1, perPage: 10, brokerId: seed.broker.id });
      expect(report).toMatchObject({ total: 2, totalAmountCents: 12_900_00 });

      const commissionId = sale.commissions[0]!.id;
      const paid = await app.sales.payCommission.execute({ saleId: sale.id, commissionId });
      expect(paid.commissions[0]).toMatchObject({ status: 'PAID', paidAt: '2026-03-10' });
      await expect(app.sales.payCommission.execute({ saleId: sale.id, commissionId })).rejects.toThrow('já foi paga');

      const pending = await app.sales.listCommissions.execute({ page: 1, perPage: 10, status: 'PENDING' });
      expect(pending).toMatchObject({ total: 2, totalAmountCents: 20_640_00 });
    });

    it('a soma das partes é sempre exatamente a comissão, mesmo com centavos quebrados', () => {
      const close = (sellingBrokerSharePercent: number, listingBrokerSharePercent: number) =>
        Sale.close({
          proposalId: 'p',
          propertyId: 'i',
          buyerId: 'b',
          sellerId: 's',
          amount: Money.fromCents(16_666_83), // 6% = R$ 1.000,0098 → R$ 1.000,01
          closedAt: dateOnly('2026-03-10'),
          commissionPercent: 6,
          sellingBrokerId: 'vendedor',
          sellingBrokerSharePercent,
          listingBrokerId: 'captador',
          listingBrokerSharePercent,
        });
      const amounts = (sale: Sale) => sale.commissions.map((commission) => commission.amount.cents);

      const halves = close(50, 50);
      expect(halves.commissionAmount.cents).toBe(1_000_01);
      expect(amounts(halves)).toEqual([500_00, 500_01]);

      const thirds = close(33.33, 33.33);
      expect(amounts(thirds).reduce((sum, cents) => sum + cents, 0)).toBe(1_000_01);
      expect(thirds.commissions.map((commission) => commission.role)).toEqual(['LISTING_BROKER', 'SELLING_BROKER', 'AGENCY']);

      expect(() => close(60, 50)).toThrow(BusinessRuleError);
    });
  });
});
