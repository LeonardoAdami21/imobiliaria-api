import { z } from 'zod';
import { idParams, optionalText, pagination, queryBoolean, type Route, route } from '@/shared/infra/http/route';
import type {
  AssignLead,
  ChangeLeadStatus,
  CreateLead,
  GetLead,
  SearchLeads,
  UpdateLead,
} from '../application/lead-use-cases';
import type { GetPerson, RegisterPerson, SearchPeople, UpdatePerson } from '../application/person-use-cases';
import type { FinishVisit, RescheduleVisit, ScheduleVisit, SearchVisits } from '../application/visit-use-cases';
import { LEAD_INTERESTS, LEAD_SOURCES, LEAD_STATUSES } from '../domain/lead';
import { VISIT_STATUSES } from '../domain/visit';

export interface CrmUseCases {
  registerPerson: RegisterPerson;
  updatePerson: UpdatePerson;
  getPerson: GetPerson;
  searchPeople: SearchPeople;
  createLead: CreateLead;
  updateLead: UpdateLead;
  assignLead: AssignLead;
  changeLeadStatus: ChangeLeadStatus;
  getLead: GetLead;
  searchLeads: SearchLeads;
  scheduleVisit: ScheduleVisit;
  rescheduleVisit: RescheduleVisit;
  finishVisit: FinishVisit;
  searchVisits: SearchVisits;
}

const personBody = z.object({
  name: z.string().trim().min(2).max(160),
  document: z.string().trim().min(11).max(18).describe('CPF ou CNPJ, com ou sem pontuação'),
  email: z.email().nullish(),
  phone: optionalText(20),
  notes: optionalText(),
});

const leadBody = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.email().nullish(),
  phone: optionalText(20),
  interest: z.enum(LEAD_INTERESTS),
  source: z.enum(LEAD_SOURCES),
  propertyId: z.uuid().nullish(),
  brokerId: z.uuid().nullish(),
  notes: optionalText(),
});

const dateTime = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

export function crmRoutes(useCases: CrmUseCases): Route[] {
  return [
    // ── Pessoas ──
    route({
      method: 'post',
      path: '/people',
      tag: 'Pessoas',
      summary: 'Cadastrar pessoa (proprietário, inquilino, comprador ou fiador)',
      status: 201,
      body: personBody,
      handler: ({ body }) => useCases.registerPerson.execute(body),
    }),
    route({
      method: 'get',
      path: '/people',
      tag: 'Pessoas',
      summary: 'Buscar pessoas por nome ou documento',
      query: z.object({ ...pagination, search: z.string().trim().max(160).optional() }),
      handler: ({ query }) => useCases.searchPeople.execute(query),
    }),
    route({
      method: 'get',
      path: '/people/:id',
      tag: 'Pessoas',
      summary: 'Consultar pessoa',
      params: idParams,
      handler: ({ params }) => useCases.getPerson.execute(params),
    }),
    route({
      method: 'patch',
      path: '/people/:id',
      tag: 'Pessoas',
      summary: 'Alterar dados de contato da pessoa',
      params: idParams,
      body: personBody.omit({ document: true }).partial(),
      handler: ({ params, body }) => useCases.updatePerson.execute({ id: params.id, ...body }),
    }),

    // ── Leads ──
    route({
      method: 'post',
      path: '/leads',
      tag: 'Leads',
      summary: 'Registrar lead (interessado em comprar ou alugar; o lead do corretor entra na carteira dele)',
      status: 201,
      body: leadBody,
      handler: ({ body, user }) => useCases.createLead.execute({ ...body, actor: user }),
    }),
    route({
      method: 'get',
      path: '/leads',
      tag: 'Leads',
      summary: 'Listar leads por etapa do funil, interesse ou corretor (corretor vê apenas os seus)',
      query: z.object({
        ...pagination,
        status: z.enum(LEAD_STATUSES).optional(),
        interest: z.enum(LEAD_INTERESTS).optional(),
        brokerId: z.uuid().optional(),
        unassigned: queryBoolean.optional(),
      }),
      handler: ({ query, user }) => useCases.searchLeads.execute({ ...query, actor: user }),
    }),
    route({
      method: 'get',
      path: '/leads/:id',
      tag: 'Leads',
      summary: 'Consultar lead',
      params: idParams,
      handler: ({ params, user }) => useCases.getLead.execute({ ...params, actor: user }),
    }),
    route({
      method: 'patch',
      path: '/leads/:id',
      tag: 'Leads',
      summary: 'Alterar dados do lead',
      params: idParams,
      body: leadBody.omit({ brokerId: true }).partial(),
      handler: ({ params, body, user }) => useCases.updateLead.execute({ id: params.id, ...body, actor: user }),
    }),
    route({
      method: 'post',
      path: '/leads/:id/assign',
      tag: 'Leads',
      summary: 'Atribuir o lead a um corretor',
      params: idParams,
      body: z.object({ brokerId: z.uuid() }),
      handler: ({ params, body, user }) =>
        useCases.assignLead.execute({ id: params.id, brokerId: body.brokerId, actor: user }),
    }),
    route({
      method: 'post',
      path: '/leads/:id/status',
      tag: 'Leads',
      summary: 'Mover o lead no funil: avançar etapa, ganhar, perder ou reabrir',
      params: idParams,
      body: z.discriminatedUnion('status', [
        z.object({ status: z.enum(['IN_SERVICE', 'VISIT_SCHEDULED', 'PROPOSAL']) }),
        z.object({ status: z.literal('WON'), personId: z.uuid().nullish() }),
        z.object({ status: z.literal('LOST'), reason: z.string().trim().min(1).max(500) }),
        z.object({ status: z.literal('REOPEN') }),
      ]),
      handler: ({ params, body, user }) => useCases.changeLeadStatus.execute({ id: params.id, ...body, actor: user }),
    }),

    // ── Visitas ──
    route({
      method: 'post',
      path: '/visits',
      tag: 'Visitas',
      summary: 'Agendar visita de um lead a um imóvel',
      status: 201,
      body: z.object({ leadId: z.uuid(), propertyId: z.uuid(), brokerId: z.uuid(), scheduledAt: dateTime }),
      handler: ({ body, user }) => useCases.scheduleVisit.execute({ ...body, actor: user }),
    }),
    route({
      method: 'get',
      path: '/visits',
      tag: 'Visitas',
      summary: 'Agenda de visitas',
      query: z.object({
        ...pagination,
        status: z.enum(VISIT_STATUSES).optional(),
        brokerId: z.uuid().optional(),
        propertyId: z.uuid().optional(),
        leadId: z.uuid().optional(),
        from: dateTime.optional(),
        to: dateTime.optional(),
      }),
      handler: ({ query }) => useCases.searchVisits.execute(query),
    }),
    route({
      method: 'post',
      path: '/visits/:id/reschedule',
      tag: 'Visitas',
      summary: 'Remarcar visita',
      params: idParams,
      body: z.object({ scheduledAt: dateTime }),
      handler: ({ params, body }) => useCases.rescheduleVisit.execute({ id: params.id, scheduledAt: body.scheduledAt }),
    }),
    route({
      method: 'post',
      path: '/visits/:id/finish',
      tag: 'Visitas',
      summary: 'Encerrar visita: realizada, cancelada ou cliente não compareceu',
      params: idParams,
      body: z.object({ outcome: z.enum(['DONE', 'CANCELED', 'NO_SHOW']), feedback: optionalText() }),
      handler: ({ params, body }) => useCases.finishVisit.execute({ id: params.id, ...body }),
    }),
  ];
}
