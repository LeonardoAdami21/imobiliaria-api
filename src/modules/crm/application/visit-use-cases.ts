import { type Actor, type Clock, mapPage, type Page, type UnitOfWork, type UseCase } from '@/shared/application/contracts';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/shared/domain/errors';
import type { UserDirectory } from '@/modules/identity/contracts';
import type { PropertyRegistry } from '@/modules/properties/contracts';
import { findVisibleLead } from './lead-use-cases';
import type { LeadRepository, VisitFilters, VisitRepository } from '../domain/repositories';
import { Visit, VISIT_DURATION_MINUTES, type VisitStatus } from '../domain/visit';

export interface VisitOutput {
  id: string;
  leadId: string;
  propertyId: string;
  brokerId: string;
  scheduledAt: Date;
  status: VisitStatus;
  feedback: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toVisitOutput(visit: Visit): VisitOutput {
  return {
    id: visit.id,
    leadId: visit.leadId,
    propertyId: visit.propertyId,
    brokerId: visit.brokerId,
    scheduledAt: visit.scheduledAt,
    status: visit.status,
    feedback: visit.feedback,
    createdAt: visit.createdAt,
    updatedAt: visit.updatedAt,
  };
}

/** Nem o corretor nem o imóvel podem ter duas visitas na mesma janela de horário. */
async function assertNoScheduleConflict(visits: VisitRepository, visit: Visit): Promise<void> {
  const windowMs = (VISIT_DURATION_MINUTES - 1) * 60 * 1000;
  const conflicts = await visits.findScheduledBetween({
    brokerId: visit.brokerId,
    propertyId: visit.propertyId,
    from: new Date(visit.scheduledAt.getTime() - windowMs),
    to: new Date(visit.scheduledAt.getTime() + windowMs),
    ignoreVisitId: visit.id,
  });
  if (conflicts.length > 0) {
    const sameBroker = conflicts.some((other) => other.brokerId === visit.brokerId);
    throw new ConflictError(
      sameBroker
        ? 'O corretor já tem outra visita agendada neste horário.'
        : 'O imóvel já tem outra visita agendada neste horário.',
      'VISIT_SCHEDULE_CONFLICT',
    );
  }
}

export interface ScheduleVisitInput {
  leadId: string;
  propertyId: string;
  brokerId: string;
  scheduledAt: Date;
  actor: Actor;
}

export class ScheduleVisit implements UseCase<ScheduleVisitInput, VisitOutput> {
  constructor(
    private readonly visits: VisitRepository,
    private readonly leads: LeadRepository,
    private readonly users: UserDirectory,
    private readonly properties: PropertyRegistry,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute({ actor, ...input }: ScheduleVisitInput): Promise<VisitOutput> {
    const lead = await findVisibleLead(this.leads, input.leadId, actor);
    if (!(await this.users.findActiveUser(input.brokerId))) throw new NotFoundError('Corretor');

    const property = await this.properties.findProperty(input.propertyId);
    if (!property) throw new NotFoundError('Imóvel');
    if (property.status !== 'AVAILABLE') {
      throw new BusinessRuleError('Só é possível agendar visita em imóvel disponível.', 'PROPERTY_NOT_AVAILABLE');
    }

    const visit = Visit.schedule(input, this.clock.now());
    await assertNoScheduleConflict(this.visits, visit);

    lead.advanceTo('VISIT_SCHEDULED');
    if (!lead.brokerId) lead.assignTo(input.brokerId);

    await this.uow.run(async () => {
      await this.visits.save(visit);
      await this.leads.save(lead);
    });
    return toVisitOutput(visit);
  }
}

export class RescheduleVisit implements UseCase<{ id: string; scheduledAt: Date }, VisitOutput> {
  constructor(
    private readonly visits: VisitRepository,
    private readonly clock: Clock,
  ) {}

  async execute({ id, scheduledAt }: { id: string; scheduledAt: Date }): Promise<VisitOutput> {
    const visit = await this.visits.findById(id);
    if (!visit) throw new NotFoundError('Visita');
    visit.reschedule(scheduledAt, this.clock.now());
    await assertNoScheduleConflict(this.visits, visit);
    await this.visits.save(visit);
    return toVisitOutput(visit);
  }
}

export interface FinishVisitInput {
  id: string;
  outcome: 'DONE' | 'CANCELED' | 'NO_SHOW';
  feedback?: string | null;
}

export class FinishVisit implements UseCase<FinishVisitInput, VisitOutput> {
  constructor(
    private readonly visits: VisitRepository,
    private readonly clock: Clock,
  ) {}

  async execute({ id, outcome, feedback }: FinishVisitInput): Promise<VisitOutput> {
    const visit = await this.visits.findById(id);
    if (!visit) throw new NotFoundError('Visita');
    visit.finish(outcome, feedback ?? null, this.clock.now());
    await this.visits.save(visit);
    return toVisitOutput(visit);
  }
}

export class SearchVisits implements UseCase<VisitFilters, Page<VisitOutput>> {
  constructor(private readonly visits: VisitRepository) {}

  async execute(filters: VisitFilters): Promise<Page<VisitOutput>> {
    return mapPage(await this.visits.search(filters), toVisitOutput);
  }
}
