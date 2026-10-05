import type { Page, PageParams, Repository } from '@/shared/domain/repository';
import type { Money } from '@/shared/domain/money';
import type { Proposal, ProposalStatus } from './proposal';
import type { CommissionRole, CommissionStatus, Sale } from './sale';

export interface ProposalFilters extends PageParams {
  status?: ProposalStatus;
  propertyId?: string;
  buyerId?: string;
  brokerId?: string;
}

export interface ProposalRepository extends Repository<Proposal> {
  search(filters: ProposalFilters): Promise<Page<Proposal>>;
  findPendingByProperty(propertyId: string): Promise<Proposal[]>;
}

export interface SaleFilters extends PageParams {
  buyerId?: string;
  sellerId?: string;
  closedFrom?: Date;
  closedTo?: Date;
}

export interface CommissionFilters extends PageParams {
  brokerId?: string;
  role?: CommissionRole;
  status?: CommissionStatus;
  closedFrom?: Date;
  closedTo?: Date;
}

/** Linha do relatório de comissões: a comissão junto com os dados da venda que a originou. */
export interface CommissionEntry {
  id: string;
  saleId: string;
  propertyId: string;
  saleClosedAt: Date;
  saleAmount: Money;
  role: CommissionRole;
  brokerId: string | null;
  sharePercent: number;
  amount: Money;
  status: CommissionStatus;
  paidAt: Date | null;
}

export interface CommissionReport extends Page<CommissionEntry> {
  /** Somatório de todas as comissões do filtro (não só da página). */
  totalAmount: Money;
}

export interface SaleRepository extends Repository<Sale> {
  search(filters: SaleFilters): Promise<Page<Sale>>;
  listCommissions(filters: CommissionFilters): Promise<CommissionReport>;
}
