import { type Clock, mapPage, type Page, type UnitOfWork, type UseCase } from '@/shared/application/contracts';
import { formatDate, isBefore } from '@/shared/domain/dates';
import { BusinessRuleError, NotFoundError } from '@/shared/domain/errors';
import type { PropertyRegistry } from '@/modules/properties/contracts';
import type { CommissionEntry, CommissionFilters, ProposalRepository, SaleFilters, SaleRepository } from '../domain/repositories';
import { type Commission, type CommissionRole, type CommissionStatus, Sale } from '../domain/sale';

export interface CommissionOutput {
  id: string;
  role: CommissionRole;
  brokerId: string | null;
  sharePercent: number;
  amountCents: number;
  status: CommissionStatus;
  paidAt: string | null;
}

export interface SaleOutput {
  id: string;
  proposalId: string;
  propertyId: string;
  buyerId: string;
  sellerId: string;
  amountCents: number;
  commissionPercent: number;
  commissionAmountCents: number;
  closedAt: string;
  commissions: CommissionOutput[];
  createdAt: Date;
}

function toCommissionOutput(commission: Commission): CommissionOutput {
  return {
    id: commission.id,
    role: commission.role,
    brokerId: commission.brokerId,
    sharePercent: commission.sharePercent,
    amountCents: commission.amount.cents,
    status: commission.status,
    paidAt: commission.paidAt && formatDate(commission.paidAt),
  };
}

export function toSaleOutput(sale: Sale): SaleOutput {
  return {
    id: sale.id,
    proposalId: sale.proposalId,
    propertyId: sale.propertyId,
    buyerId: sale.buyerId,
    sellerId: sale.sellerId,
    amountCents: sale.amount.cents,
    commissionPercent: sale.commissionPercent,
    commissionAmountCents: sale.commissionAmount.cents,
    closedAt: formatDate(sale.closedAt),
    commissions: sale.commissions.map(toCommissionOutput),
    createdAt: sale.createdAt,
  };
}

export interface CloseSaleInput {
  proposalId: string;
  /** Data da assinatura. Padrão: hoje. */
  closedAt?: Date;
  commissionPercent: number;
  sellingBrokerSharePercent: number;
  listingBrokerSharePercent: number;
}

/**
 * Fechamento da venda a partir de uma proposta aceita: registra a venda com o
 * rateio da comissão, marca o imóvel como vendido e recusa as demais propostas.
 */
export class CloseSale implements UseCase<CloseSaleInput, SaleOutput> {
  constructor(
    private readonly sales: SaleRepository,
    private readonly proposals: ProposalRepository,
    private readonly properties: PropertyRegistry,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(input: CloseSaleInput): Promise<SaleOutput> {
    const proposal = await this.proposals.findById(input.proposalId);
    if (!proposal) throw new NotFoundError('Proposta');
    if (proposal.status !== 'ACCEPTED') {
      throw new BusinessRuleError('Só uma proposta aceita pode virar venda.', 'PROPOSAL_NOT_ACCEPTED');
    }
    const property = await this.properties.findProperty(proposal.propertyId);
    if (!property) throw new NotFoundError('Imóvel');

    const today = this.clock.today();
    const closedAt = input.closedAt ?? today;
    if (isBefore(today, closedAt)) {
      throw new BusinessRuleError('A data da venda não pode estar no futuro.', 'SALE_DATE_IN_THE_FUTURE');
    }

    const sale = Sale.close({
      proposalId: proposal.id,
      propertyId: property.id,
      buyerId: proposal.buyerId,
      sellerId: property.ownerId,
      amount: proposal.amount,
      closedAt,
      commissionPercent: input.commissionPercent,
      sellingBrokerId: proposal.brokerId,
      sellingBrokerSharePercent: input.sellingBrokerSharePercent,
      listingBrokerId: property.listingBrokerId,
      listingBrokerSharePercent: input.listingBrokerSharePercent,
    });

    const others = await this.proposals.findPendingByProperty(property.id);
    for (const other of others) other.reject('Imóvel vendido para outro comprador.', this.clock.now());

    await this.uow.run(async () => {
      await this.properties.markAsSold(property.id);
      await this.sales.save(sale);
      for (const other of others) await this.proposals.save(other);
    });
    return toSaleOutput(sale);
  }
}

export class PayCommission implements UseCase<{ saleId: string; commissionId: string; paidAt?: Date }, SaleOutput> {
  constructor(
    private readonly sales: SaleRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: { saleId: string; commissionId: string; paidAt?: Date }): Promise<SaleOutput> {
    const sale = await this.sales.findById(input.saleId);
    if (!sale) throw new NotFoundError('Venda');

    const today = this.clock.today();
    const paidAt = input.paidAt ?? today;
    if (isBefore(today, paidAt)) {
      throw new BusinessRuleError('A data do pagamento não pode estar no futuro.', 'PAYMENT_IN_THE_FUTURE');
    }
    sale.payCommission(input.commissionId, paidAt);
    await this.sales.save(sale);
    return toSaleOutput(sale);
  }
}

export class GetSale implements UseCase<{ id: string }, SaleOutput> {
  constructor(private readonly sales: SaleRepository) {}

  async execute({ id }: { id: string }): Promise<SaleOutput> {
    const sale = await this.sales.findById(id);
    if (!sale) throw new NotFoundError('Venda');
    return toSaleOutput(sale);
  }
}

export class SearchSales implements UseCase<SaleFilters, Page<SaleOutput>> {
  constructor(private readonly sales: SaleRepository) {}

  async execute(filters: SaleFilters): Promise<Page<SaleOutput>> {
    return mapPage(await this.sales.search(filters), toSaleOutput);
  }
}

export interface CommissionEntryOutput {
  id: string;
  saleId: string;
  propertyId: string;
  saleClosedAt: string;
  saleAmountCents: number;
  role: CommissionRole;
  brokerId: string | null;
  sharePercent: number;
  amountCents: number;
  status: CommissionStatus;
  paidAt: string | null;
}

export interface CommissionReportOutput extends Page<CommissionEntryOutput> {
  /** Soma de todas as comissões do filtro, não só as da página. */
  totalAmountCents: number;
}

function toEntryOutput(entry: CommissionEntry): CommissionEntryOutput {
  return {
    id: entry.id,
    saleId: entry.saleId,
    propertyId: entry.propertyId,
    saleClosedAt: formatDate(entry.saleClosedAt),
    saleAmountCents: entry.saleAmount.cents,
    role: entry.role,
    brokerId: entry.brokerId,
    sharePercent: entry.sharePercent,
    amountCents: entry.amount.cents,
    status: entry.status,
    paidAt: entry.paidAt && formatDate(entry.paidAt),
  };
}

/** Relatório de comissões: a pagar e pagas, por corretor e período. */
export class ListCommissions implements UseCase<CommissionFilters, CommissionReportOutput> {
  constructor(private readonly sales: SaleRepository) {}

  async execute(filters: CommissionFilters): Promise<CommissionReportOutput> {
    const { totalAmount, ...page } = await this.sales.listCommissions(filters);
    return { ...mapPage(page, toEntryOutput), totalAmountCents: totalAmount.cents };
  }
}
