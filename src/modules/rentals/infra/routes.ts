import { z } from 'zod';
import type { UserRole } from '@/modules/identity/contracts';
import {
  calendarDate,
  cents,
  idParams,
  optionalText,
  pagination,
  percent,
  positiveCents,
  queryBoolean,
  type Route,
  route,
} from '@/shared/infra/http/route';
import type { PayCharge, QuoteCharge, RegisterOwnerTransfer, SearchCharges } from '../application/charge-use-cases';
import type { AdjustRent, CloseLease, CreateLease, GetLease, SearchLeases } from '../application/lease-use-cases';
import { ADJUSTMENT_INDEXES, GUARANTEE_TYPES, LEASE_STATUSES } from '../domain/lease';
import { CHARGE_STATUSES, TRANSFER_STATUSES } from '../domain/rent-charge';

export interface RentalsUseCases {
  createLease: CreateLease;
  adjustRent: AdjustRent;
  closeLease: CloseLease;
  getLease: GetLease;
  searchLeases: SearchLeases;
  searchCharges: SearchCharges;
  quoteCharge: QuoteCharge;
  payCharge: PayCharge;
  registerOwnerTransfer: RegisterOwnerTransfer;
}

/** Contratos e dinheiro ficam com gerência e financeiro; corretores apenas consultam. */
const RENTAL_MANAGERS: UserRole[] = ['ADMIN', 'MANAGER', 'FINANCE'];

export function rentalsRoutes(useCases: RentalsUseCases): Route[] {
  return [
    // ── Contratos ──
    route({
      method: 'post',
      path: '/leases',
      tag: 'Locação',
      summary: 'Criar contrato de locação (gera as cobranças mensais e marca o imóvel como alugado)',
      roles: RENTAL_MANAGERS,
      status: 201,
      body: z.object({
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
      handler: ({ body }) => useCases.createLease.execute(body),
    }),
    route({
      method: 'get',
      path: '/leases',
      tag: 'Locação',
      summary: 'Listar contratos de locação',
      query: z.object({
        ...pagination,
        status: z.enum(LEASE_STATUSES).optional(),
        propertyId: z.uuid().optional(),
        tenantId: z.uuid().optional(),
        ownerId: z.uuid().optional(),
      }),
      handler: ({ query }) => useCases.searchLeases.execute(query),
    }),
    route({
      method: 'get',
      path: '/leases/:id',
      tag: 'Locação',
      summary: 'Consultar contrato de locação',
      params: idParams,
      handler: ({ params }) => useCases.getLease.execute(params),
    }),
    route({
      method: 'post',
      path: '/leases/:id/adjust-rent',
      tag: 'Locação',
      summary: 'Aplicar o reajuste anual do aluguel',
      roles: RENTAL_MANAGERS,
      params: idParams,
      body: z.object({
        percent: z.number().gt(-100).max(100).describe('Ex.: 4.5 para +4,5%'),
        effectiveFrom: calendarDate.optional(),
      }),
      handler: ({ params, body }) => useCases.adjustRent.execute({ id: params.id, ...body }),
    }),
    route({
      method: 'post',
      path: '/leases/:id/close',
      tag: 'Locação',
      summary: 'Encerrar ou rescindir o contrato e liberar o imóvel',
      roles: RENTAL_MANAGERS,
      params: idParams,
      body: z.object({ date: calendarDate.optional(), reason: optionalText(500) }),
      handler: ({ params, body }) => useCases.closeLease.execute({ id: params.id, ...body }),
    }),

    // ── Cobranças ──
    route({
      method: 'get',
      path: '/charges',
      tag: 'Cobranças',
      summary: 'Listar cobranças de aluguel (por contrato, situação, atrasadas, repasse pendente)',
      query: z.object({
        ...pagination,
        leaseId: z.uuid().optional(),
        status: z.enum(CHARGE_STATUSES).optional(),
        transferStatus: z.enum(TRANSFER_STATUSES).optional(),
        overdue: queryBoolean.optional(),
        dueFrom: calendarDate.optional(),
        dueTo: calendarDate.optional(),
      }),
      handler: ({ query }) => useCases.searchCharges.execute(query),
    }),
    route({
      method: 'get',
      path: '/charges/:id/quote',
      tag: 'Cobranças',
      summary: 'Calcular o valor atualizado da cobrança (com multa e juros) para uma data',
      params: idParams,
      query: z.object({ date: calendarDate.optional() }),
      handler: ({ params, query }) => useCases.quoteCharge.execute({ id: params.id, date: query.date }),
    }),
    route({
      method: 'post',
      path: '/charges/:id/pay',
      tag: 'Cobranças',
      summary: 'Dar baixa no pagamento do aluguel',
      roles: RENTAL_MANAGERS,
      params: idParams,
      body: z.object({ paidAt: calendarDate.optional() }),
      handler: ({ params, body }) => useCases.payCharge.execute({ id: params.id, paidAt: body.paidAt }),
    }),
    route({
      method: 'post',
      path: '/charges/:id/transfer',
      tag: 'Cobranças',
      summary: 'Registrar o repasse ao proprietário',
      roles: RENTAL_MANAGERS,
      params: idParams,
      body: z.object({ date: calendarDate.optional() }),
      handler: ({ params, body }) => useCases.registerOwnerTransfer.execute({ id: params.id, date: body.date }),
    }),
  ];
}
