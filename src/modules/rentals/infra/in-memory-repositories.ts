import type { Page } from '@/shared/application/contracts';
import { InMemoryRepository } from '@/shared/testing/in-memory-repository';
import type { Lease } from '../domain/lease';
import type { ChargeFilters, LeaseFilters, LeaseRepository, RentChargeRepository } from '../domain/repositories';
import type { RentCharge } from '../domain/rent-charge';

export class InMemoryLeaseRepository extends InMemoryRepository<Lease> implements LeaseRepository {
  async search(filters: LeaseFilters): Promise<Page<Lease>> {
    const found = this.items.filter(
      (lease) =>
        (!filters.status || lease.status === filters.status) &&
        (!filters.propertyId || lease.propertyId === filters.propertyId) &&
        (!filters.tenantId || lease.tenantId === filters.tenantId) &&
        (!filters.ownerId || lease.ownerId === filters.ownerId),
    );
    return this.paginate(found, filters);
  }
}

export class InMemoryRentChargeRepository extends InMemoryRepository<RentCharge> implements RentChargeRepository {
  async saveAll(charges: RentCharge[]): Promise<void> {
    for (const charge of charges) await this.save(charge);
  }

  async findPendingByLease(leaseId: string): Promise<RentCharge[]> {
    return this.items
      .filter((charge) => charge.leaseId === leaseId && charge.status === 'PENDING')
      .sort((a, b) => a.referenceMonth.getTime() - b.referenceMonth.getTime());
  }

  async search(filters: ChargeFilters): Promise<Page<RentCharge>> {
    const status = filters.overdueBefore ? 'PENDING' : filters.status;
    const found = this.items
      .filter(
        (charge) =>
          (!filters.leaseId || charge.leaseId === filters.leaseId) &&
          (!status || charge.status === status) &&
          (!filters.transferStatus || charge.payment?.transferStatus === filters.transferStatus) &&
          (!filters.overdueBefore || charge.dueDate < filters.overdueBefore) &&
          (!filters.dueFrom || charge.dueDate >= filters.dueFrom) &&
          (!filters.dueTo || charge.dueDate <= filters.dueTo),
      )
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    return this.paginate(found, filters);
  }
}
