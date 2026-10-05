import type { Prisma, Proposal as ProposalRow } from '@/generated/prisma/client';
import type { Page } from '@/shared/application/contracts';
import { Money } from '@/shared/domain/money';
import { fromMoney, type PrismaContext, skipTake, toMoney, toNumber } from '@/shared/infra/database/prisma';
import { Proposal } from '../domain/proposal';
import type {
  CommissionFilters,
  CommissionReport,
  ProposalFilters,
  ProposalRepository,
  SaleFilters,
  SaleRepository,
} from '../domain/repositories';
import { Sale } from '../domain/sale';

// ───────────────────────────── Propostas ─────────────────────────────

function toProposal(row: ProposalRow): Proposal {
  return Proposal.restore(row.id, {
    propertyId: row.propertyId,
    buyerId: row.buyerId,
    brokerId: row.brokerId,
    amount: toMoney(row.amount),
    paymentTerms: row.paymentTerms,
    validUntil: row.validUntil,
    status: row.status,
    decidedAt: row.decidedAt,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class PrismaProposalRepository implements ProposalRepository {
  constructor(private readonly db: PrismaContext) {}

  async findById(id: string): Promise<Proposal | null> {
    const row = await this.db.client.proposal.findUnique({ where: { id } });
    return row && toProposal(row);
  }

  async findPendingByProperty(propertyId: string): Promise<Proposal[]> {
    const rows = await this.db.client.proposal.findMany({ where: { propertyId, status: 'PENDING' } });
    return rows.map(toProposal);
  }

  async search(filters: ProposalFilters): Promise<Page<Proposal>> {
    const where: Prisma.ProposalWhereInput = {
      status: filters.status,
      propertyId: filters.propertyId,
      buyerId: filters.buyerId,
      brokerId: filters.brokerId,
    };
    const [rows, total] = await Promise.all([
      this.db.client.proposal.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(filters) }),
      this.db.client.proposal.count({ where }),
    ]);
    return { items: rows.map(toProposal), total, page: filters.page, perPage: filters.perPage };
  }

  async save(proposal: Proposal): Promise<void> {
    const data = {
      propertyId: proposal.propertyId,
      buyerId: proposal.buyerId,
      brokerId: proposal.brokerId,
      amount: fromMoney(proposal.amount),
      paymentTerms: proposal.paymentTerms,
      validUntil: proposal.validUntil,
      status: proposal.status,
      decidedAt: proposal.decidedAt,
      rejectionReason: proposal.rejectionReason,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
    };
    await this.db.client.proposal.upsert({ where: { id: proposal.id }, create: { id: proposal.id, ...data }, update: data });
  }
}

// ───────────────────────────── Vendas e comissões ─────────────────────────────

const withCommissions = { commissions: { orderBy: { role: 'asc' } } } satisfies Prisma.SaleInclude;
type SaleRow = Prisma.SaleGetPayload<{ include: typeof withCommissions }>;

function toSale(row: SaleRow): Sale {
  return Sale.restore(row.id, {
    proposalId: row.proposalId,
    propertyId: row.propertyId,
    buyerId: row.buyerId,
    sellerId: row.sellerId,
    amount: toMoney(row.amount),
    commissionPercent: toNumber(row.commissionPercent),
    commissionAmount: toMoney(row.commissionAmount),
    closedAt: row.closedAt,
    commissions: row.commissions.map((commission) => ({
      id: commission.id,
      role: commission.role,
      brokerId: commission.brokerId,
      sharePercent: toNumber(commission.sharePercent),
      amount: toMoney(commission.amount),
      status: commission.status,
      paidAt: commission.paidAt,
    })),
    createdAt: row.createdAt,
  });
}

export class PrismaSaleRepository implements SaleRepository {
  constructor(private readonly db: PrismaContext) {}

  async findById(id: string): Promise<Sale | null> {
    const row = await this.db.client.sale.findUnique({ where: { id }, include: withCommissions });
    return row && toSale(row);
  }

  async search(filters: SaleFilters): Promise<Page<Sale>> {
    const where: Prisma.SaleWhereInput = {
      buyerId: filters.buyerId,
      sellerId: filters.sellerId,
      closedAt: filters.closedFrom || filters.closedTo ? { gte: filters.closedFrom, lte: filters.closedTo } : undefined,
    };
    const [rows, total] = await Promise.all([
      this.db.client.sale.findMany({ where, include: withCommissions, orderBy: { closedAt: 'desc' }, ...skipTake(filters) }),
      this.db.client.sale.count({ where }),
    ]);
    return { items: rows.map(toSale), total, page: filters.page, perPage: filters.perPage };
  }

  async listCommissions(filters: CommissionFilters): Promise<CommissionReport> {
    const where: Prisma.CommissionWhereInput = {
      brokerId: filters.brokerId,
      role: filters.role,
      status: filters.status,
      sale: filters.closedFrom || filters.closedTo ? { closedAt: { gte: filters.closedFrom, lte: filters.closedTo } } : undefined,
    };
    const [rows, summary] = await Promise.all([
      this.db.client.commission.findMany({
        where,
        include: { sale: true },
        orderBy: [{ sale: { closedAt: 'desc' } }, { id: 'asc' }],
        ...skipTake(filters),
      }),
      this.db.client.commission.aggregate({ where, _count: true, _sum: { amount: true } }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        saleId: row.saleId,
        propertyId: row.sale.propertyId,
        saleClosedAt: row.sale.closedAt,
        saleAmount: toMoney(row.sale.amount),
        role: row.role,
        brokerId: row.brokerId,
        sharePercent: toNumber(row.sharePercent),
        amount: toMoney(row.amount),
        status: row.status,
        paidAt: row.paidAt,
      })),
      total: summary._count,
      page: filters.page,
      perPage: filters.perPage,
      totalAmount: toMoney(summary._sum.amount) ?? Money.zero(),
    };
  }

  async save(sale: Sale): Promise<void> {
    const data = {
      proposalId: sale.proposalId,
      propertyId: sale.propertyId,
      buyerId: sale.buyerId,
      sellerId: sale.sellerId,
      amount: fromMoney(sale.amount),
      commissionPercent: sale.commissionPercent,
      commissionAmount: fromMoney(sale.commissionAmount),
      closedAt: sale.closedAt,
      createdAt: sale.createdAt,
    };

    // Venda e comissões formam um agregado só: são gravadas na mesma transação.
    await this.db.run(async () => {
      const client = this.db.client;
      await client.sale.upsert({ where: { id: sale.id }, create: { id: sale.id, ...data }, update: data });
      for (const commission of sale.commissions) {
        const row = {
          saleId: sale.id,
          role: commission.role,
          brokerId: commission.brokerId,
          sharePercent: commission.sharePercent,
          amount: fromMoney(commission.amount),
          status: commission.status,
          paidAt: commission.paidAt,
        };
        await client.commission.upsert({ where: { id: commission.id }, create: { id: commission.id, ...row }, update: row });
      }
    });
  }
}
