import { Email } from '@/shared/domain/email';
import { AggregateRoot, newId } from '@/shared/domain/entity';
import { BusinessRuleError, ValidationError } from '@/shared/domain/errors';

export const LEAD_STATUSES = ['NEW', 'IN_SERVICE', 'VISIT_SCHEDULED', 'PROPOSAL', 'WON', 'LOST'] as const;
/** Funil: novo → em atendimento → visita agendada → proposta → ganho | perdido. */
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_INTERESTS = ['BUY', 'RENT'] as const;
export type LeadInterest = (typeof LEAD_INTERESTS)[number];

export const LEAD_SOURCES = ['WEBSITE', 'PORTAL', 'REFERRAL', 'WALK_IN', 'SOCIAL_MEDIA', 'PHONE', 'OTHER'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

const OPEN_STATUSES: readonly LeadStatus[] = ['NEW', 'IN_SERVICE', 'VISIT_SCHEDULED', 'PROPOSAL'];

export interface LeadProps {
  name: string;
  email: Email | null;
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

export interface LeadInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  interest: LeadInterest;
  source: LeadSource;
  propertyId?: string | null;
  brokerId?: string | null;
  notes?: string | null;
}

/** Lead: alguém que demonstrou interesse em comprar ou alugar e ainda não fechou negócio. */
export class Lead extends AggregateRoot<LeadProps> {
  static create(input: LeadInput): Lead {
    const now = new Date();
    const lead = new Lead(newId(), {
      name: Lead.validName(input.name),
      email: input.email ? Email.create(input.email) : null,
      phone: input.phone?.replace(/\D/g, '') || null,
      interest: input.interest,
      source: input.source,
      status: 'NEW',
      propertyId: input.propertyId ?? null,
      brokerId: input.brokerId ?? null,
      personId: null,
      notes: input.notes?.trim() || null,
      lostReason: null,
      createdAt: now,
      updatedAt: now,
    });
    lead.assertReachable();
    return lead;
  }

  static restore(id: string, props: LeadProps): Lead {
    return new Lead(id, props);
  }

  private static validName(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length < 2) throw new ValidationError('Nome deve ter pelo menos 2 caracteres.');
    return trimmed;
  }

  /** Sem telefone nem e-mail não há como o corretor retornar o contato. */
  private assertReachable(): void {
    if (!this.props.email && !this.props.phone) {
      throw new BusinessRuleError('Informe ao menos um contato do lead: telefone ou e-mail.', 'LEAD_WITHOUT_CONTACT');
    }
  }

  get name(): string { return this.props.name; }
  get email(): Email | null { return this.props.email; }
  get phone(): string | null { return this.props.phone; }
  get interest(): LeadInterest { return this.props.interest; }
  get source(): LeadSource { return this.props.source; }
  get status(): LeadStatus { return this.props.status; }
  get propertyId(): string | null { return this.props.propertyId; }
  get brokerId(): string | null { return this.props.brokerId; }
  get personId(): string | null { return this.props.personId; }
  get notes(): string | null { return this.props.notes; }
  get lostReason(): string | null { return this.props.lostReason; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  get isOpen(): boolean {
    return OPEN_STATUSES.includes(this.props.status);
  }

  private assertOpen(): void {
    if (!this.isOpen) {
      throw new BusinessRuleError('Este lead já foi encerrado. Reabra-o para continuar o atendimento.', 'LEAD_CLOSED');
    }
  }

  update(changes: Partial<Omit<LeadInput, 'brokerId'>>): void {
    this.assertOpen();
    if (changes.name !== undefined) this.props.name = Lead.validName(changes.name);
    if (changes.email !== undefined) this.props.email = changes.email ? Email.create(changes.email) : null;
    if (changes.phone !== undefined) this.props.phone = changes.phone?.replace(/\D/g, '') || null;
    if (changes.interest !== undefined) this.props.interest = changes.interest;
    if (changes.source !== undefined) this.props.source = changes.source;
    if (changes.propertyId !== undefined) this.props.propertyId = changes.propertyId;
    if (changes.notes !== undefined) this.props.notes = changes.notes?.trim() || null;
    this.assertReachable();
    this.touch();
  }

  /** Atribui o corretor responsável. Um lead novo passa a "em atendimento". */
  assignTo(brokerId: string): void {
    this.assertOpen();
    this.props.brokerId = brokerId;
    if (this.props.status === 'NEW') this.props.status = 'IN_SERVICE';
    this.touch();
  }

  /** Avança o funil. Só anda para a frente: voltar etapa exige reabrir o lead. */
  advanceTo(status: 'IN_SERVICE' | 'VISIT_SCHEDULED' | 'PROPOSAL'): void {
    this.assertOpen();
    if (OPEN_STATUSES.indexOf(status) > OPEN_STATUSES.indexOf(this.props.status)) {
      this.props.status = status;
      this.touch();
    }
  }

  /** Negócio fechado. Opcionalmente vincula a pessoa cadastrada em que o lead se converteu. */
  win(personId?: string | null): void {
    this.assertOpen();
    this.props.status = 'WON';
    if (personId) this.props.personId = personId;
    this.touch();
  }

  lose(reason: string): void {
    this.assertOpen();
    const trimmed = reason.trim();
    if (!trimmed) throw new ValidationError('Informe o motivo da perda do lead.');
    this.props.status = 'LOST';
    this.props.lostReason = trimmed;
    this.touch();
  }

  reopen(): void {
    if (this.isOpen) throw new BusinessRuleError('Este lead já está em aberto.', 'LEAD_ALREADY_OPEN');
    this.props.status = 'IN_SERVICE';
    this.props.lostReason = null;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
