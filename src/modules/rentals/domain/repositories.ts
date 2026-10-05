import type { Page, PageParams, Repository } from '@/shared/domain/repository';
import type { Lease, LeaseStatus } from './lease';
import type { ChargeStatus, RentCharge, TransferStatus } from './rent-charge';

export interface LeaseFilters extends PageParams {
  status?: LeaseStatus;
  propertyId?: string;
  tenantId?: string;
  ownerId?: string;
}

export interface LeaseRepository extends Repository<Lease> {
  search(filters: LeaseFilters): Promise<Page<Lease>>;
}

export interface ChargeFilters extends PageParams {
  leaseId?: string;
  status?: ChargeStatus;
  transferStatus?: TransferStatus;
  /** Só cobranças pendentes com vencimento anterior a esta data (as atrasadas). */
  overdueBefore?: Date;
  dueFrom?: Date;
  dueTo?: Date;
}

export interface RentChargeRepository extends Repository<RentCharge> {
  saveAll(charges: RentCharge[]): Promise<void>;
  findPendingByLease(leaseId: string): Promise<RentCharge[]>;
  search(filters: ChargeFilters): Promise<Page<RentCharge>>;
}
