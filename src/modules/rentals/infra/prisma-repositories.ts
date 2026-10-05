import type { Lease as LeaseRow, Prisma, RentCharge as ChargeRow } from '@/generated/prisma/client';
import type { Page } from '@/shared/application/contracts';
import { fromMoney, type PrismaContext, skipTake, toMoney, toNumber } from '@/shared/infra/database/prisma';
import { Lease } from '../domain/lease';
import type { ChargeFilters, LeaseFilters, LeaseRepository, RentChargeRepository } from '../domain/repositories';
import { RentCharge } from '../domain/rent-charge';

// ───────────────────────────── Contratos ─────────────────────────────

function toLease(row: LeaseRow): Lease {
  return Lease.restore(row.id, {
    propertyId: row.propertyId,
    tenantId: row.tenantId,
    ownerId: row.ownerId,
    guarantorId: row.guarantorId,
    startDate: row.startDate,
    endDate: row.endDate,
    durationMonths: row.durationMonths,
    rentAmount: toMoney(row.rentAmount),
    dueDay: row.dueDay,
    adminFeePercent: toNumber(row.adminFeePercent),
    lateFeePercent: toNumber(row.lateFeePercent),
    monthlyInterestPercent: toNumber(row.monthlyInterestPercent),
    guaranteeType: row.guaranteeType,
    depositAmount: toMoney(row.depositAmount),
    adjustmentIndex: row.adjustmentIndex,
    lastAdjustmentAt: row.lastAdjustmentAt,
    status: row.status,
    terminatedAt: row.terminatedAt,
    terminationReason: row.terminationReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class PrismaLeaseRepository implements LeaseRepository {
  constructor(private readonly db: PrismaContext) {}

  async findById(id: string): Promise<Lease | null> {
    const row = await this.db.client.lease.findUnique({ where: { id } });
    return row && toLease(row);
  }

  async search(filters: LeaseFilters): Promise<Page<Lease>> {
    const where: Prisma.LeaseWhereInput = {
      status: filters.status,
      propertyId: filters.propertyId,
      tenantId: filters.tenantId,
      ownerId: filters.ownerId,
    };
    const [rows, total] = await Promise.all([
      this.db.client.lease.findMany({ where, orderBy: { startDate: 'desc' }, ...skipTake(filters) }),
      this.db.client.lease.count({ where }),
    ]);
    return { items: rows.map(toLease), total, page: filters.page, perPage: filters.perPage };
  }

  async save(lease: Lease): Promise<void> {
    const data = {
      propertyId: lease.propertyId,
      tenantId: lease.tenantId,
      ownerId: lease.ownerId,
      guarantorId: lease.guarantorId,
      startDate: lease.startDate,
      endDate: lease.endDate,
      durationMonths: lease.durationMonths,
      rentAmount: fromMoney(lease.rentAmount),
      dueDay: lease.dueDay,
      ...lease.terms,
      guaranteeType: lease.guaranteeType,
      depositAmount: fromMoney(lease.depositAmount),
      adjustmentIndex: lease.adjustmentIndex,
      lastAdjustmentAt: lease.lastAdjustmentAt,
      status: lease.status,
      terminatedAt: lease.terminatedAt,
      terminationReason: lease.terminationReason,
      createdAt: lease.createdAt,
      updatedAt: lease.updatedAt,
    };
    await this.db.client.lease.upsert({ where: { id: lease.id }, create: { id: lease.id, ...data }, update: data });
  }
}

// ───────────────────────────── Cobranças ─────────────────────────────

function toCharge(row: ChargeRow): RentCharge {
  // O pagamento existe quando paidAt está preenchido; as demais colunas o acompanham.
  const paid = row.paidAt !== null;
  return RentCharge.restore(row.id, {
    leaseId: row.leaseId,
    referenceMonth: row.referenceMonth,
    dueDate: row.dueDate,
    amount: toMoney(row.amount),
    status: row.status,
    payment: paid
      ? {
          paidAt: row.paidAt!,
          lateFee: toMoney(row.lateFeeAmount!),
          interest: toMoney(row.interestAmount!),
          paidAmount: toMoney(row.paidAmount!),
          adminFee: toMoney(row.adminFeeAmount!),
          ownerTransfer: toMoney(row.ownerTransferAmount!),
          transferStatus: row.transferStatus!,
          transferredAt: row.transferredAt,
        }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class PrismaRentChargeRepository implements RentChargeRepository {
  constructor(private readonly db: PrismaContext) {}

  async findById(id: string): Promise<RentCharge | null> {
    const row = await this.db.client.rentCharge.findUnique({ where: { id } });
    return row && toCharge(row);
  }

  async findPendingByLease(leaseId: string): Promise<RentCharge[]> {
    const rows = await this.db.client.rentCharge.findMany({
      where: { leaseId, status: 'PENDING' },
      orderBy: { referenceMonth: 'asc' },
    });
    return rows.map(toCharge);
  }

  async search(filters: ChargeFilters): Promise<Page<RentCharge>> {
    const hasDueFilter = filters.overdueBefore || filters.dueFrom || filters.dueTo;
    const where: Prisma.RentChargeWhereInput = {
      leaseId: filters.leaseId,
      status: filters.overdueBefore ? 'PENDING' : filters.status,
      transferStatus: filters.transferStatus,
      dueDate: hasDueFilter ? { lt: filters.overdueBefore, gte: filters.dueFrom, lte: filters.dueTo } : undefined,
    };
    const [rows, total] = await Promise.all([
      this.db.client.rentCharge.findMany({ where, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], ...skipTake(filters) }),
      this.db.client.rentCharge.count({ where }),
    ]);
    return { items: rows.map(toCharge), total, page: filters.page, perPage: filters.perPage };
  }

  async save(charge: RentCharge): Promise<void> {
    const payment = charge.payment;
    const data = {
      leaseId: charge.leaseId,
      referenceMonth: charge.referenceMonth,
      dueDate: charge.dueDate,
      amount: fromMoney(charge.amount),
      status: charge.status,
      paidAt: payment?.paidAt ?? null,
      lateFeeAmount: payment ? fromMoney(payment.lateFee) : null,
      interestAmount: payment ? fromMoney(payment.interest) : null,
      paidAmount: payment ? fromMoney(payment.paidAmount) : null,
      adminFeeAmount: payment ? fromMoney(payment.adminFee) : null,
      ownerTransferAmount: payment ? fromMoney(payment.ownerTransfer) : null,
      transferStatus: payment?.transferStatus ?? null,
      transferredAt: payment?.transferredAt ?? null,
      createdAt: charge.createdAt,
      updatedAt: charge.updatedAt,
    };
    await this.db.client.rentCharge.upsert({ where: { id: charge.id }, create: { id: charge.id, ...data }, update: data });
  }

  async saveAll(charges: RentCharge[]): Promise<void> {
    await this.db.run(async () => {
      for (const charge of charges) await this.save(charge);
    });
  }
}
