import type { Page, PageParams, Repository } from '@/shared/domain/repository';
import type { Lead, LeadInterest, LeadStatus } from './lead';
import type { Person } from './person';
import type { Visit, VisitStatus } from './visit';

export interface PersonFilters extends PageParams {
  /** Busca por parte do nome ou pelo documento. */
  search?: string;
}

export interface PersonRepository extends Repository<Person> {
  findByDocument(document: string): Promise<Person | null>;
  search(filters: PersonFilters): Promise<Page<Person>>;
}

export interface LeadFilters extends PageParams {
  status?: LeadStatus;
  interest?: LeadInterest;
  brokerId?: string;
  /** true = só leads ainda sem corretor responsável. */
  unassigned?: boolean;
}

export interface LeadRepository extends Repository<Lead> {
  search(filters: LeadFilters): Promise<Page<Lead>>;
}

export interface VisitFilters extends PageParams {
  status?: VisitStatus;
  brokerId?: string;
  propertyId?: string;
  leadId?: string;
  from?: Date;
  to?: Date;
}

export interface VisitRepository extends Repository<Visit> {
  search(filters: VisitFilters): Promise<Page<Visit>>;
  /** Visitas agendadas do mesmo corretor ou do mesmo imóvel dentro do intervalo. */
  findScheduledBetween(input: {
    brokerId: string;
    propertyId: string;
    from: Date;
    to: Date;
    ignoreVisitId?: string;
  }): Promise<Visit[]>;
}
