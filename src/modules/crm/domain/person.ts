import { Document } from '@/shared/domain/document';
import { Email } from '@/shared/domain/email';
import { AggregateRoot, newId } from '@/shared/domain/entity';
import { ValidationError } from '@/shared/domain/errors';

export const PERSON_TYPES = ['INDIVIDUAL', 'COMPANY'] as const;
/** INDIVIDUAL = pessoa física (CPF), COMPANY = pessoa jurídica (CNPJ). */
export type PersonType = (typeof PERSON_TYPES)[number];

export interface PersonProps {
  type: PersonType;
  name: string;
  document: Document;
  email: Email | null;
  phone: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PersonInput {
  name: string;
  document: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

/**
 * Pessoa com quem a imobiliária faz negócio. A mesma pessoa pode ser
 * proprietária de um imóvel, inquilina de outro e fiadora de um terceiro:
 * o papel vem do contrato, não do cadastro.
 */
export class Person extends AggregateRoot<PersonProps> {
  static create(input: PersonInput): Person {
    const now = new Date();
    const document = Document.create(input.document);
    return new Person(newId(), {
      type: document.kind === 'CPF' ? 'INDIVIDUAL' : 'COMPANY',
      name: Person.validName(input.name),
      document,
      email: input.email ? Email.create(input.email) : null,
      phone: Person.validPhone(input.phone),
      notes: input.notes?.trim() || null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(id: string, props: PersonProps): Person {
    return new Person(id, props);
  }

  private static validName(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length < 2) throw new ValidationError('Nome deve ter pelo menos 2 caracteres.');
    return trimmed;
  }

  private static validPhone(phone?: string | null): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 13) {
      throw new ValidationError('Telefone deve ter DDD e número (10 a 13 dígitos).', 'INVALID_PHONE');
    }
    return digits;
  }

  get type(): PersonType { return this.props.type; }
  get name(): string { return this.props.name; }
  get document(): Document { return this.props.document; }
  get email(): Email | null { return this.props.email; }
  get phone(): string | null { return this.props.phone; }
  get notes(): string | null { return this.props.notes; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  /** O documento identifica a pessoa e não pode ser trocado depois do cadastro. */
  update(changes: Omit<Partial<PersonInput>, 'document'>): void {
    if (changes.name !== undefined) this.props.name = Person.validName(changes.name);
    if (changes.email !== undefined) this.props.email = changes.email ? Email.create(changes.email) : null;
    if (changes.phone !== undefined) this.props.phone = Person.validPhone(changes.phone);
    if (changes.notes !== undefined) this.props.notes = changes.notes?.trim() || null;
    this.props.updatedAt = new Date();
  }
}
