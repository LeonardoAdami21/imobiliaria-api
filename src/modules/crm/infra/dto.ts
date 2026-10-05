import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { optionalText, pagination, queryBoolean } from '@/shared/infra/http/schemas';
import { LEAD_INTERESTS, LEAD_SOURCES, LEAD_STATUSES } from '../domain/lead';
import { VISIT_STATUSES } from '../domain/visit';

// ── Pessoas ──

const personBody = z.object({
  name: z.string().trim().min(2).max(160),
  document: z.string().trim().min(11).max(18).describe('CPF ou CNPJ, com ou sem pontuação'),
  email: z.email().nullish(),
  phone: optionalText(20),
  notes: optionalText(),
});

export class RegisterPersonDto extends createZodDto(personBody) {}
export class UpdatePersonDto extends createZodDto(personBody.omit({ document: true }).partial()) {}
export class SearchPeopleQueryDto extends createZodDto(
  z.object({ ...pagination, search: z.string().trim().max(160).optional() }),
) {}

// ── Leads ──

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

export class CreateLeadDto extends createZodDto(leadBody) {}
export class UpdateLeadDto extends createZodDto(leadBody.omit({ brokerId: true }).partial()) {}
export class SearchLeadsQueryDto extends createZodDto(
  z.object({
    ...pagination,
    status: z.enum(LEAD_STATUSES).optional(),
    interest: z.enum(LEAD_INTERESTS).optional(),
    brokerId: z.uuid().optional(),
    unassigned: queryBoolean.optional(),
  }),
) {}
export class AssignLeadDto extends createZodDto(z.object({ brokerId: z.uuid() })) {}
/** União discriminada: não vira classe DTO, então o controller valida com ZodValidationPipe explícito. */
export const changeLeadStatusBody = z.discriminatedUnion('status', [
  z.object({ status: z.enum(['IN_SERVICE', 'VISIT_SCHEDULED', 'PROPOSAL']) }),
  z.object({ status: z.literal('WON'), personId: z.uuid().nullish() }),
  z.object({ status: z.literal('LOST'), reason: z.string().trim().min(1).max(500) }),
  z.object({ status: z.literal('REOPEN') }),
]);
export type ChangeLeadStatusBody = z.output<typeof changeLeadStatusBody>;

// ── Visitas ──

const dateTime = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

export class ScheduleVisitDto extends createZodDto(
  z.object({ leadId: z.uuid(), propertyId: z.uuid(), brokerId: z.uuid(), scheduledAt: dateTime }),
) {}
export class SearchVisitsQueryDto extends createZodDto(
  z.object({
    ...pagination,
    status: z.enum(VISIT_STATUSES).optional(),
    brokerId: z.uuid().optional(),
    propertyId: z.uuid().optional(),
    leadId: z.uuid().optional(),
    from: dateTime.optional(),
    to: dateTime.optional(),
  }),
) {}
export class RescheduleVisitDto extends createZodDto(z.object({ scheduledAt: dateTime })) {}
export class FinishVisitDto extends createZodDto(
  z.object({ outcome: z.enum(['DONE', 'CANCELED', 'NO_SHOW']), feedback: optionalText() }),
) {}
