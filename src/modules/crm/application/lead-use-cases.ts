import { type Actor, mapPage, type Page, type UseCase } from '@/shared/application/contracts';
import { BusinessRuleError, NotFoundError } from '@/shared/domain/errors';
import type { UserDirectory } from '@/modules/identity/contracts';
import type { PropertyRegistry } from '@/modules/properties/contracts';
import type { PersonDirectory } from '../contracts';
import { Lead, type LeadInput, type LeadInterest, type LeadSource, type LeadStatus } from '../domain/lead';
import type { LeadFilters, LeadRepository } from '../domain/repositories';

export interface LeadOutput {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  interest: LeadInterest;
  source: LeadSource;
  status: LeadStatus;
  propertyId: string | null;
  brokerId: string | null;
  personId: string | null;
  notes: string | null;
  lostReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toLeadOutput(lead: Lead): LeadOutput {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email?.value ?? null,
    phone: lead.phone,
    interest: lead.interest,
    source: lead.source,
    status: lead.status,
    propertyId: lead.propertyId,
    brokerId: lead.brokerId,
    personId: lead.personId,
    notes: lead.notes,
    lostReason: lead.lostReason,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}

/**
 * Carteira do corretor: o corretor só enxerga os leads atribuídos a ele.
 * Os demais papéis (administrador, gerente, financeiro) veem todos.
 */
function canSee(lead: Lead, actor: Actor): boolean {
  return actor.role !== 'BROKER' || lead.brokerId === actor.id;
}

/** Busca o lead e trata o que está fora da carteira do corretor como inexistente, sem revelar que existe. */
export async function findVisibleLead(leads: LeadRepository, id: string, actor: Actor): Promise<Lead> {
  const lead = await leads.findById(id);
  if (!lead || !canSee(lead, actor)) throw new NotFoundError('Lead');
  return lead;
}

/** Verificações de referências a outros módulos, compartilhadas pelos casos de uso de lead. */
class LeadReferences {
  constructor(
    private readonly users: UserDirectory,
    private readonly properties: PropertyRegistry,
  ) {}

  async assertBroker(brokerId: string): Promise<void> {
    if (!(await this.users.findActiveUser(brokerId))) throw new NotFoundError('Corretor');
  }

  async assertProperty(propertyId: string): Promise<void> {
    if (!(await this.properties.findProperty(propertyId))) throw new NotFoundError('Imóvel');
  }
}

export type CreateLeadInput = LeadInput & { actor: Actor };

export class CreateLead implements UseCase<CreateLeadInput, LeadOutput> {
  private readonly references: LeadReferences;

  constructor(
    private readonly leads: LeadRepository,
    users: UserDirectory,
    properties: PropertyRegistry,
  ) {
    this.references = new LeadReferences(users, properties);
  }

  async execute({ actor, ...input }: CreateLeadInput): Promise<LeadOutput> {
    if (input.propertyId) await this.references.assertProperty(input.propertyId);
    const lead = Lead.create({ ...input, brokerId: null });
    // O lead registrado pelo corretor entra sempre na carteira dele.
    const brokerId = actor.role === 'BROKER' ? actor.id : input.brokerId;
    if (brokerId) {
      await this.references.assertBroker(brokerId);
      lead.assignTo(brokerId);
    }
    await this.leads.save(lead);
    return toLeadOutput(lead);
  }
}

export type UpdateLeadInput = { id: string; actor: Actor } & Partial<Omit<LeadInput, 'brokerId'>>;

export class UpdateLead implements UseCase<UpdateLeadInput, LeadOutput> {
  constructor(
    private readonly leads: LeadRepository,
    private readonly properties: PropertyRegistry,
  ) {}

  async execute({ id, actor, ...changes }: UpdateLeadInput): Promise<LeadOutput> {
    const lead = await findVisibleLead(this.leads, id, actor);
    if (changes.propertyId && !(await this.properties.findProperty(changes.propertyId))) {
      throw new NotFoundError('Imóvel');
    }
    lead.update(changes);
    await this.leads.save(lead);
    return toLeadOutput(lead);
  }
}

export interface AssignLeadInput {
  id: string;
  brokerId: string;
  actor: Actor;
}

/** Atribui ou transfere o lead. O corretor só consegue transferir os leads da própria carteira. */
export class AssignLead implements UseCase<AssignLeadInput, LeadOutput> {
  constructor(
    private readonly leads: LeadRepository,
    private readonly users: UserDirectory,
  ) {}

  async execute({ id, brokerId, actor }: AssignLeadInput): Promise<LeadOutput> {
    const lead = await findVisibleLead(this.leads, id, actor);
    if (!(await this.users.findActiveUser(brokerId))) throw new NotFoundError('Corretor');
    lead.assignTo(brokerId);
    await this.leads.save(lead);
    return toLeadOutput(lead);
  }
}

export type ChangeLeadStatusInput = { id: string; actor: Actor } & (
  | { status: 'IN_SERVICE' | 'VISIT_SCHEDULED' | 'PROPOSAL' }
  | { status: 'WON'; personId?: string | null }
  | { status: 'LOST'; reason: string }
  | { status: 'REOPEN' }
);

export class ChangeLeadStatus implements UseCase<ChangeLeadStatusInput, LeadOutput> {
  constructor(
    private readonly leads: LeadRepository,
    private readonly people: PersonDirectory,
  ) {}

  async execute(input: ChangeLeadStatusInput): Promise<LeadOutput> {
    const lead = await findVisibleLead(this.leads, input.id, input.actor);

    switch (input.status) {
      case 'WON':
        if (input.personId && !(await this.people.findPerson(input.personId))) throw new NotFoundError('Pessoa');
        lead.win(input.personId);
        break;
      case 'LOST':
        lead.lose(input.reason);
        break;
      case 'REOPEN':
        lead.reopen();
        break;
      default: {
        const before = lead.status;
        lead.advanceTo(input.status);
        if (lead.status === before && before !== input.status) {
          throw new BusinessRuleError('O funil só avança. Para voltar uma etapa, reabra o lead.', 'LEAD_CANNOT_GO_BACK');
        }
      }
    }

    await this.leads.save(lead);
    return toLeadOutput(lead);
  }
}

export class GetLead implements UseCase<{ id: string; actor: Actor }, LeadOutput> {
  constructor(private readonly leads: LeadRepository) {}

  async execute({ id, actor }: { id: string; actor: Actor }): Promise<LeadOutput> {
    return toLeadOutput(await findVisibleLead(this.leads, id, actor));
  }
}

export type SearchLeadsInput = LeadFilters & { actor: Actor };

export class SearchLeads implements UseCase<SearchLeadsInput, Page<LeadOutput>> {
  constructor(private readonly leads: LeadRepository) {}

  async execute({ actor, ...filters }: SearchLeadsInput): Promise<Page<LeadOutput>> {
    if (actor.role === 'BROKER') {
      // Leads sem corretor estão fora de qualquer carteira.
      if (filters.unassigned) return { items: [], total: 0, page: filters.page, perPage: filters.perPage };
      filters = { ...filters, brokerId: actor.id };
    }
    return mapPage(await this.leads.search(filters), toLeadOutput);
  }
}
