import type { Page } from '@/shared/application/contracts';
import { Money } from '@/shared/domain/money';
import { InMemoryRepository } from '@/shared/testing/in-memory-repository';
import type { Proposal } from '../domain/proposal';
import type {
  CommissionEntry,
  CommissionFilters,
  CommissionReport,
  ProposalFilters,
  ProposalRepository,
  SaleFilters,
  SaleRepository,
} from '../domain/repositories';
import type { Sale } from '../domain/sale';

export class InMemoryProposalRepository extends InMemoryRepository<Proposal> implements ProposalRepository {
  async findPendingByProperty(propertyId: string): Promise<Proposal[]> {
    return this.items.filter((proposal) => proposal.propertyId === propertyId && proposal.status === 'PENDING');
  }

  async search(filters: ProposalFilters): Promise<Page<Proposal>> {
    const found = this.items.filter(
      (proposal) =>
        (!filters.status || proposal.status === filters.status) &&
        (!filters.propertyId || proposal.propertyId === filters.propertyId) &&
        (!filters.buyerId || proposal.buyerId === filters.buyerId) &&
        (!filters.brokerId || proposal.brokerId === filters.brokerId),
    );
    return this.paginate(found, filters);
  }
}

export class InMemorySaleRepository extends InMemoryRepository<Sale> implements SaleRepository {
  async search(filters: SaleFilters): Promise<Page<Sale>> {
    const found = this.items.filter(
      (sale) =>
        (!filters.buyerId || sale.buyerId === filters.buyerId) &&
        (!filters.sellerId || sale.sellerId === filters.sellerId) &&
        (!filters.closedFrom || sale.closedAt >= filters.closedFrom) &&
        (!filters.closedTo || sale.closedAt <= filters.closedTo),
    );
    return this.paginate(found, filters);
  }

  async listCommissions(filters: CommissionFilters): Promise<CommissionReport> {
    const entries: CommissionEntry[] = this.items
      .filter(
        (sale) =>
          (!filters.closedFrom || sale.closedAt >= filters.closedFrom) &&
          (!filters.closedTo || sale.closedAt <= filters.closedTo),
      )
      .flatMap((sale) =>
        sale.commissions.map((commission) => ({
          ...commission,
          saleId: sale.id,
          propertyId: sale.propertyId,
          saleClosedAt: sale.closedAt,
          saleAmount: sale.amount,
        })),
      )
      .filter(
        (entry) =>
          (!filters.brokerId || entry.brokerId === filters.brokerId) &&
          (!filters.role || entry.role === filters.role) &&
          (!filters.status || entry.status === filters.status),
      );
    const start = (filters.page - 1) * filters.perPage;
    return {
      items: entries.slice(start, start + filters.perPage),
      total: entries.length,
      page: filters.page,
      perPage: filters.perPage,
      totalAmount: entries.reduce((sum, entry) => sum.add(entry.amount), Money.zero()),
    };
  }
}
