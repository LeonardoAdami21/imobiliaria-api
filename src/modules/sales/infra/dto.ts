import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { calendarDate, optionalText, pagination, percent, positiveCents } from '@/shared/infra/http/schemas';
import { PROPOSAL_STATUSES } from '../domain/proposal';
import { COMMISSION_ROLES, COMMISSION_STATUSES } from '../domain/sale';

// ── Propostas ──

export class CreateProposalDto extends createZodDto(
  z.object({
    propertyId: z.uuid(),
    buyerId: z.uuid(),
    brokerId: z.uuid().optional().describe('Corretor vendedor. Padrão: o usuário autenticado'),
    amountCents: positiveCents,
    paymentTerms: optionalText(1000),
    validUntil: calendarDate.nullish(),
  }),
) {}

export class SearchProposalsQueryDto extends createZodDto(
  z.object({
    ...pagination,
    status: z.enum(PROPOSAL_STATUSES).optional(),
    propertyId: z.uuid().optional(),
    buyerId: z.uuid().optional(),
    brokerId: z.uuid().optional(),
  }),
) {}

export class RejectProposalDto extends createZodDto(z.object({ reason: z.string().trim().min(1).max(500) })) {}

// ── Vendas e comissões ──

export class CloseSaleDto extends createZodDto(
  z.object({
    proposalId: z.uuid(),
    closedAt: calendarDate.optional(),
    commissionPercent: percent.default(6).describe('Comissão sobre o valor da venda'),
    sellingBrokerSharePercent: percent.describe('Parte da comissão do corretor que trouxe o comprador'),
    listingBrokerSharePercent: percent.default(0).describe('Parte da comissão do corretor que captou o imóvel'),
  }),
) {}

export class SearchSalesQueryDto extends createZodDto(
  z.object({
    ...pagination,
    buyerId: z.uuid().optional(),
    sellerId: z.uuid().optional(),
    closedFrom: calendarDate.optional(),
    closedTo: calendarDate.optional(),
  }),
) {}

export class CommissionParamsDto extends createZodDto(z.object({ id: z.uuid(), commissionId: z.uuid() })) {}

export class PayCommissionDto extends createZodDto(z.object({ paidAt: calendarDate.optional() })) {}

export class ListCommissionsQueryDto extends createZodDto(
  z.object({
    ...pagination,
    brokerId: z.uuid().optional(),
    role: z.enum(COMMISSION_ROLES).optional(),
    status: z.enum(COMMISSION_STATUSES).optional(),
    closedFrom: calendarDate.optional(),
    closedTo: calendarDate.optional(),
  }),
) {}
