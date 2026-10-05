import type { Lead as LeadRow, Person as PersonRow, Prisma, Visit as VisitRow } from '@/generated/prisma/client';
import type { Page } from '@/shared/application/contracts';
import { Document } from '@/shared/domain/document';
import { Email } from '@/shared/domain/email';
import { type PrismaContext, skipTake } from '@/shared/infra/database/prisma';
import { Lead } from '../domain/lead';
import { Person } from '../domain/person';
import type {
  LeadFilters,
  LeadRepository,
  PersonFilters,
  PersonRepository,
  VisitFilters,
  VisitRepository,
} from '../domain/repositories';
import { Visit } from '../domain/visit';

// ───────────────────────────── Pessoas ─────────────────────────────

function toPerson(row: PersonRow): Person {
  return Person.restore(row.id, {
    type: row.type,
    name: row.name,
    document: Document.create(row.document),
    email: row.email ? Email.create(row.email) : null,
    phone: row.phone,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class PrismaPersonRepository implements PersonRepository {
  constructor(private readonly db: PrismaContext) {}

  async findById(id: string): Promise<Person | null> {
    const row = await this.db.client.person.findUnique({ where: { id } });
    return row && toPerson(row);
  }

  async findByDocument(document: string): Promise<Person | null> {
    const row = await this.db.client.person.findUnique({ where: { document } });
    return row && toPerson(row);
  }

  async search(filters: PersonFilters): Promise<Page<Person>> {
    const where: Prisma.PersonWhereInput = filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { document: { startsWith: filters.search.toUpperCase() } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.db.client.person.findMany({ where, orderBy: { name: 'asc' }, ...skipTake(filters) }),
      this.db.client.person.count({ where }),
    ]);
    return { items: rows.map(toPerson), total, page: filters.page, perPage: filters.perPage };
  }

  async save(person: Person): Promise<void> {
    const data = {
      type: person.type,
      name: person.name,
      document: person.document.value,
      email: person.email?.value ?? null,
      phone: person.phone,
      notes: person.notes,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    };
    await this.db.client.person.upsert({ where: { id: person.id }, create: { id: person.id, ...data }, update: data });
  }
}

// ───────────────────────────── Leads ─────────────────────────────

function toLead(row: LeadRow): Lead {
  return Lead.restore(row.id, {
    name: row.name,
    email: row.email ? Email.create(row.email) : null,
    phone: row.phone,
    interest: row.interest,
    source: row.source,
    status: row.status,
    propertyId: row.propertyId,
    brokerId: row.brokerId,
    personId: row.personId,
    notes: row.notes,
    lostReason: row.lostReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class PrismaLeadRepository implements LeadRepository {
  constructor(private readonly db: PrismaContext) {}

  async findById(id: string): Promise<Lead | null> {
    const row = await this.db.client.lead.findUnique({ where: { id } });
    return row && toLead(row);
  }

  async search(filters: LeadFilters): Promise<Page<Lead>> {
    const where: Prisma.LeadWhereInput = {
      status: filters.status,
      interest: filters.interest,
      brokerId: filters.unassigned ? null : filters.brokerId,
    };
    const [rows, total] = await Promise.all([
      this.db.client.lead.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(filters) }),
      this.db.client.lead.count({ where }),
    ]);
    return { items: rows.map(toLead), total, page: filters.page, perPage: filters.perPage };
  }

  async save(lead: Lead): Promise<void> {
    const data = {
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
    await this.db.client.lead.upsert({ where: { id: lead.id }, create: { id: lead.id, ...data }, update: data });
  }
}

// ───────────────────────────── Visitas ─────────────────────────────

function toVisit(row: VisitRow): Visit {
  return Visit.restore(row.id, {
    leadId: row.leadId,
    propertyId: row.propertyId,
    brokerId: row.brokerId,
    scheduledAt: row.scheduledAt,
    status: row.status,
    feedback: row.feedback,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class PrismaVisitRepository implements VisitRepository {
  constructor(private readonly db: PrismaContext) {}

  async findById(id: string): Promise<Visit | null> {
    const row = await this.db.client.visit.findUnique({ where: { id } });
    return row && toVisit(row);
  }

  async search(filters: VisitFilters): Promise<Page<Visit>> {
    const where: Prisma.VisitWhereInput = {
      status: filters.status,
      brokerId: filters.brokerId,
      propertyId: filters.propertyId,
      leadId: filters.leadId,
      scheduledAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
    };
    const [rows, total] = await Promise.all([
      this.db.client.visit.findMany({ where, orderBy: { scheduledAt: 'asc' }, ...skipTake(filters) }),
      this.db.client.visit.count({ where }),
    ]);
    return { items: rows.map(toVisit), total, page: filters.page, perPage: filters.perPage };
  }

  async findScheduledBetween(input: {
    brokerId: string;
    propertyId: string;
    from: Date;
    to: Date;
    ignoreVisitId?: string;
  }): Promise<Visit[]> {
    const rows = await this.db.client.visit.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { gte: input.from, lte: input.to },
        OR: [{ brokerId: input.brokerId }, { propertyId: input.propertyId }],
        id: input.ignoreVisitId ? { not: input.ignoreVisitId } : undefined,
      },
    });
    return rows.map(toVisit);
  }

  async save(visit: Visit): Promise<void> {
    const data = {
      leadId: visit.leadId,
      propertyId: visit.propertyId,
      brokerId: visit.brokerId,
      scheduledAt: visit.scheduledAt,
      status: visit.status,
      feedback: visit.feedback,
      createdAt: visit.createdAt,
      updatedAt: visit.updatedAt,
    };
    await this.db.client.visit.upsert({ where: { id: visit.id }, create: { id: visit.id, ...data }, update: data });
  }
}
