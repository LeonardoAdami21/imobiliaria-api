import type { Page } from '@/shared/application/contracts';
import { InMemoryRepository } from '@/shared/testing/in-memory-repository';
import type { Lead } from '../domain/lead';
import type { Person } from '../domain/person';
import type {
  LeadFilters,
  LeadRepository,
  PersonFilters,
  PersonRepository,
  VisitFilters,
  VisitRepository,
} from '../domain/repositories';
import type { Visit } from '../domain/visit';

export class InMemoryPersonRepository extends InMemoryRepository<Person> implements PersonRepository {
  async findByDocument(document: string): Promise<Person | null> {
    return this.items.find((person) => person.document.value === document) ?? null;
  }

  async search(filters: PersonFilters): Promise<Page<Person>> {
    const term = filters.search?.toLowerCase();
    const found = this.items.filter(
      (person) => !term || person.name.toLowerCase().includes(term) || person.document.value.toLowerCase().startsWith(term),
    );
    return this.paginate(found, filters);
  }
}

export class InMemoryLeadRepository extends InMemoryRepository<Lead> implements LeadRepository {
  async search(filters: LeadFilters): Promise<Page<Lead>> {
    const found = this.items.filter(
      (lead) =>
        (!filters.status || lead.status === filters.status) &&
        (!filters.interest || lead.interest === filters.interest) &&
        (filters.unassigned ? lead.brokerId === null : !filters.brokerId || lead.brokerId === filters.brokerId),
    );
    return this.paginate(found, filters);
  }
}

export class InMemoryVisitRepository extends InMemoryRepository<Visit> implements VisitRepository {
  async search(filters: VisitFilters): Promise<Page<Visit>> {
    const found = this.items.filter(
      (visit) =>
        (!filters.status || visit.status === filters.status) &&
        (!filters.brokerId || visit.brokerId === filters.brokerId) &&
        (!filters.propertyId || visit.propertyId === filters.propertyId) &&
        (!filters.leadId || visit.leadId === filters.leadId) &&
        (!filters.from || visit.scheduledAt >= filters.from) &&
        (!filters.to || visit.scheduledAt <= filters.to),
    );
    return this.paginate(found, filters);
  }

  async findScheduledBetween(input: {
    brokerId: string;
    propertyId: string;
    from: Date;
    to: Date;
    ignoreVisitId?: string;
  }): Promise<Visit[]> {
    return this.items.filter(
      (visit) =>
        visit.status === 'SCHEDULED' &&
        visit.id !== input.ignoreVisitId &&
        visit.scheduledAt >= input.from &&
        visit.scheduledAt <= input.to &&
        (visit.brokerId === input.brokerId || visit.propertyId === input.propertyId),
    );
  }
}
