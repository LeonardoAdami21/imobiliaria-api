import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  calendarDate,
  cents,
  optionalText,
  pagination,
  percent,
  positiveCents,
  queryBoolean,
} from '@/shared/infra/http/schemas';
import { ADJUSTMENT_INDEXES, GUARANTEE_TYPES, LEASE_STATUSES } from '../domain/lease';
import { CHARGE_STATUSES, TRANSFER_STATUSES } from '../domain/rent-charge';

// ── Contratos ──

export class CreateLeaseDto extends createZodDto(
  z.object({
    propertyId: z.uuid(),
    tenantId: z.uuid(),
    guarantorId: z.uuid().nullish(),
    startDate: calendarDate,
    durationMonths: z.number().int().min(1).max(120).default(30),
    rentAmountCents: positiveCents,
    dueDay: z.number().int().min(1).max(28),
    adminFeePercent: percent.default(10),
    lateFeePercent: percent.max(20).default(10),
    monthlyInterestPercent: percent.max(10).default(1),
    guaranteeType: z.enum(GUARANTEE_TYPES),
    depositAmountCents: cents.nullish(),
    adjustmentIndex: z.enum(ADJUSTMENT_INDEXES).default('IPCA'),
  }),
) {}

export class SearchLeasesQueryDto extends createZodDto(
  z.object({
    ...pagination,
    status: z.enum(LEASE_STATUSES).optional(),
    propertyId: z.uuid().optional(),
    tenantId: z.uuid().optional(),
    ownerId: z.uuid().optional(),
  }),
) {}

export class AdjustRentDto extends createZodDto(
  z.object({
    percent: z.number().gt(-100).max(100).describe('Ex.: 4.5 para +4,5%'),
    effectiveFrom: calendarDate.optional(),
  }),
) {}

export class CloseLeaseDto extends createZodDto(z.object({ date: calendarDate.optional(), reason: optionalText(500) })) {}

// ── Cobranças ──

export class SearchChargesQueryDto extends createZodDto(
  z.object({
    ...pagination,
    leaseId: z.uuid().optional(),
    status: z.enum(CHARGE_STATUSES).optional(),
    transferStatus: z.enum(TRANSFER_STATUSES).optional(),
    overdue: queryBoolean.optional(),
    dueFrom: calendarDate.optional(),
    dueTo: calendarDate.optional(),
  }),
) {}

export class QuoteChargeQueryDto extends createZodDto(z.object({ date: calendarDate.optional() })) {}

export class PayChargeDto extends createZodDto(z.object({ paidAt: calendarDate.optional() })) {}

export class OwnerTransferDto extends createZodDto(z.object({ date: calendarDate.optional() })) {}
