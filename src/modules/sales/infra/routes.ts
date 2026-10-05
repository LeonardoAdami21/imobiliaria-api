import { z } from 'zod';
import type { UserRole } from '@/modules/identity/contracts';
import {
  calendarDate,
  idParams,
  optionalText,
  pagination,
  percent,
  positiveCents,
  type Route,
  route,
} from '@/shared/infra/http/route';
import type { CreateProposal, DecideProposal, GetProposal, SearchProposals } from '../application/proposal-use-cases';
import type { CloseSale, GetSale, ListCommissions, PayCommission, SearchSales } from '../application/sale-use-cases';
import { PROPOSAL_STATUSES } from '../domain/proposal';
import { COMMISSION_ROLES, COMMISSION_STATUSES } from '../domain/sale';

export interface SalesUseCases {
  createProposal: CreateProposal;
  decideProposal: DecideProposal;
  getProposal: GetProposal;
  searchProposals: SearchProposals;
  closeSale: CloseSale;
  payCommission: PayCommission;
  getSale: GetSale;
  searchSales: SearchSales;
  listCommissions: ListCommissions;
}

const NEGOTIATORS: UserRole[] = ['ADMIN', 'MANAGER', 'BROKER'];
const MANAGEMENT: UserRole[] = ['ADMIN', 'MANAGER'];
const PAYERS: UserRole[] = ['ADMIN', 'MANAGER', 'FINANCE'];

export function salesRoutes(useCases: SalesUseCases): Route[] {
  return [
    // ── Propostas ──
    route({
      method: 'post',
      path: '/proposals',
      tag: 'Propostas',
      summary: 'Registrar proposta de compra',
      roles: NEGOTIATORS,
      status: 201,
      body: z.object({
        propertyId: z.uuid(),
        buyerId: z.uuid(),
        brokerId: z.uuid().optional().describe('Corretor vendedor. Padrão: o usuário autenticado'),
        amountCents: positiveCents,
        paymentTerms: optionalText(1000),
        validUntil: calendarDate.nullish(),
      }),
      handler: ({ body, user }) => useCases.createProposal.execute({ ...body, brokerId: body.brokerId ?? user.id }),
    }),
    route({
      method: 'get',
      path: '/proposals',
      tag: 'Propostas',
      summary: 'Listar propostas',
      query: z.object({
        ...pagination,
        status: z.enum(PROPOSAL_STATUSES).optional(),
        propertyId: z.uuid().optional(),
        buyerId: z.uuid().optional(),
        brokerId: z.uuid().optional(),
      }),
      handler: ({ query }) => useCases.searchProposals.execute(query),
    }),
    route({
      method: 'get',
      path: '/proposals/:id',
      tag: 'Propostas',
      summary: 'Consultar proposta',
      params: idParams,
      handler: ({ params }) => useCases.getProposal.execute(params),
    }),
    route({
      method: 'post',
      path: '/proposals/:id/accept',
      tag: 'Propostas',
      summary: 'Aceitar proposta (reserva o imóvel)',
      roles: MANAGEMENT,
      params: idParams,
      handler: ({ params }) => useCases.decideProposal.execute({ id: params.id, decision: 'ACCEPT' }),
    }),
    route({
      method: 'post',
      path: '/proposals/:id/reject',
      tag: 'Propostas',
      summary: 'Recusar proposta',
      roles: MANAGEMENT,
      params: idParams,
      body: z.object({ reason: z.string().trim().min(1).max(500) }),
      handler: ({ params, body }) =>
        useCases.decideProposal.execute({ id: params.id, decision: 'REJECT', reason: body.reason }),
    }),
    route({
      method: 'post',
      path: '/proposals/:id/cancel',
      tag: 'Propostas',
      summary: 'Cancelar proposta por desistência do comprador (libera o imóvel se estava reservado)',
      roles: NEGOTIATORS,
      params: idParams,
      handler: ({ params }) => useCases.decideProposal.execute({ id: params.id, decision: 'CANCEL' }),
    }),

    // ── Vendas ──
    route({
      method: 'post',
      path: '/sales',
      tag: 'Vendas',
      summary: 'Fechar a venda de uma proposta aceita e gerar as comissões',
      roles: MANAGEMENT,
      status: 201,
      body: z.object({
        proposalId: z.uuid(),
        closedAt: calendarDate.optional(),
        commissionPercent: percent.default(6).describe('Comissão sobre o valor da venda'),
        sellingBrokerSharePercent: percent.describe('Parte da comissão do corretor que trouxe o comprador'),
        listingBrokerSharePercent: percent.default(0).describe('Parte da comissão do corretor que captou o imóvel'),
      }),
      handler: ({ body }) => useCases.closeSale.execute(body),
    }),
    route({
      method: 'get',
      path: '/sales',
      tag: 'Vendas',
      summary: 'Listar vendas',
      query: z.object({
        ...pagination,
        buyerId: z.uuid().optional(),
        sellerId: z.uuid().optional(),
        closedFrom: calendarDate.optional(),
        closedTo: calendarDate.optional(),
      }),
      handler: ({ query }) => useCases.searchSales.execute(query),
    }),
    route({
      method: 'get',
      path: '/sales/:id',
      tag: 'Vendas',
      summary: 'Consultar venda e suas comissões',
      params: idParams,
      handler: ({ params }) => useCases.getSale.execute(params),
    }),
    route({
      method: 'post',
      path: '/sales/:id/commissions/:commissionId/pay',
      tag: 'Comissões',
      summary: 'Registrar o pagamento de uma comissão',
      roles: PAYERS,
      params: z.object({ id: z.uuid(), commissionId: z.uuid() }),
      body: z.object({ paidAt: calendarDate.optional() }),
      handler: ({ params, body }) =>
        useCases.payCommission.execute({ saleId: params.id, commissionId: params.commissionId, paidAt: body.paidAt }),
    }),
    route({
      method: 'get',
      path: '/commissions',
      tag: 'Comissões',
      summary: 'Relatório de comissões por corretor, situação e período (corretor vê apenas as suas)',
      query: z.object({
        ...pagination,
        brokerId: z.uuid().optional(),
        role: z.enum(COMMISSION_ROLES).optional(),
        status: z.enum(COMMISSION_STATUSES).optional(),
        closedFrom: calendarDate.optional(),
        closedTo: calendarDate.optional(),
      }),
      handler: ({ query, user }) =>
        useCases.listCommissions.execute(user.role === 'BROKER' ? { ...query, brokerId: user.id } : query),
    }),
  ];
}
