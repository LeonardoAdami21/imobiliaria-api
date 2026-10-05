import { mapPage, type Page, type UseCase } from '@/shared/application/contracts';
import { ConflictError, NotFoundError } from '@/shared/domain/errors';
import type { PersonDirectory, PersonSummary } from '../contracts';
import { Person, type PersonInput, type PersonType } from '../domain/person';
import type { PersonFilters, PersonRepository } from '../domain/repositories';

export interface PersonOutput {
  id: string;
  type: PersonType;
  name: string;
  document: string;
  documentFormatted: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toPersonOutput(person: Person): PersonOutput {
  return {
    id: person.id,
    type: person.type,
    name: person.name,
    document: person.document.value,
    documentFormatted: person.document.formatted,
    email: person.email?.value ?? null,
    phone: person.phone,
    notes: person.notes,
    createdAt: person.createdAt,
    updatedAt: person.updatedAt,
  };
}

export class RegisterPerson implements UseCase<PersonInput, PersonOutput> {
  constructor(private readonly people: PersonRepository) {}

  async execute(input: PersonInput): Promise<PersonOutput> {
    const person = Person.create(input);
    if (await this.people.findByDocument(person.document.value)) {
      throw new ConflictError(`Já existe uma pessoa cadastrada com o ${person.document.kind} informado.`, 'DOCUMENT_ALREADY_IN_USE');
    }
    await this.people.save(person);
    return toPersonOutput(person);
  }
}

export class UpdatePerson implements UseCase<{ id: string } & Omit<Partial<PersonInput>, 'document'>, PersonOutput> {
  constructor(private readonly people: PersonRepository) {}

  async execute({ id, ...changes }: { id: string } & Omit<Partial<PersonInput>, 'document'>): Promise<PersonOutput> {
    const person = await this.people.findById(id);
    if (!person) throw new NotFoundError('Pessoa');
    person.update(changes);
    await this.people.save(person);
    return toPersonOutput(person);
  }
}

export class GetPerson implements UseCase<{ id: string }, PersonOutput> {
  constructor(private readonly people: PersonRepository) {}

  async execute({ id }: { id: string }): Promise<PersonOutput> {
    const person = await this.people.findById(id);
    if (!person) throw new NotFoundError('Pessoa');
    return toPersonOutput(person);
  }
}

export class SearchPeople implements UseCase<PersonFilters, Page<PersonOutput>> {
  constructor(private readonly people: PersonRepository) {}

  async execute(filters: PersonFilters): Promise<Page<PersonOutput>> {
    // Quem digita "529.982.247-25" espera achar a pessoa pelo documento sem pontuação.
    const search = filters.search?.trim();
    const normalized = search && /^[\d.\-/\s]+$/.test(search) ? search.replace(/\D/g, '') : search;
    return mapPage(await this.people.search({ ...filters, search: normalized || undefined }), toPersonOutput);
  }
}

/** Implementação do contrato público consumido pelos outros módulos. */
export class PersonDirectoryService implements PersonDirectory {
  constructor(private readonly people: PersonRepository) {}

  async findPerson(id: string): Promise<PersonSummary | null> {
    const person = await this.people.findById(id);
    return person && { id: person.id, name: person.name, document: person.document.value };
  }
}
