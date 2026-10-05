import { isBefore } from '@/shared/domain/dates';
import { AggregateRoot, newId } from '@/shared/domain/entity';
import { BusinessRuleError, ValidationError } from '@/shared/domain/errors';
import type { Money } from '@/shared/domain/money';

export const PROPOSAL_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELED'] as const;
/** Aguardando resposta do proprietário, aceita, recusada ou cancelada pelo comprador. */
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export interface ProposalProps {
  propertyId: string;
  buyerId: string;
  /** Corretor que atendeu o comprador (corretor vendedor). */
  brokerId: string;
  amount: Money;
  paymentTerms: string | null;
  validUntil: Date | null;
  status: ProposalStatus;
  decidedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProposalInput {
  propertyId: string;
  buyerId: string;
  brokerId: string;
  amount: Money;
  paymentTerms?: string | null;
  validUntil?: Date | null;
}

/** Proposta de compra de um imóvel feita por um comprador. */
export class Proposal extends AggregateRoot<ProposalProps> {
  static create(input: CreateProposalInput, today: Date): Proposal {
    if (input.amount.isZero()) throw new ValidationError('O valor da proposta deve ser maior que zero.');
    if (input.validUntil && isBefore(input.validUntil, today)) {
      throw new ValidationError('A validade da proposta não pode estar no passado.');
    }
    const now = new Date();
    return new Proposal(newId(), {
      propertyId: input.propertyId,
      buyerId: input.buyerId,
      brokerId: input.brokerId,
      amount: input.amount,
      paymentTerms: input.paymentTerms?.trim() || null,
      validUntil: input.validUntil ?? null,
      status: 'PENDING',
      decidedAt: null,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(id: string, props: ProposalProps): Proposal {
    return new Proposal(id, props);
  }

  get propertyId(): string { return this.props.propertyId; }
  get buyerId(): string { return this.props.buyerId; }
  get brokerId(): string { return this.props.brokerId; }
  get amount(): Money { return this.props.amount; }
  get paymentTerms(): string | null { return this.props.paymentTerms; }
  get validUntil(): Date | null { return this.props.validUntil; }
  get status(): ProposalStatus { return this.props.status; }
  get decidedAt(): Date | null { return this.props.decidedAt; }
  get rejectionReason(): string | null { return this.props.rejectionReason; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  private assertPending(action: string): void {
    if (this.props.status !== 'PENDING') {
      throw new BusinessRuleError(`Só é possível ${action} uma proposta pendente.`, 'PROPOSAL_NOT_PENDING');
    }
  }

  accept(now: Date, today: Date): void {
    this.assertPending('aceitar');
    if (this.props.validUntil && isBefore(this.props.validUntil, today)) {
      throw new BusinessRuleError('Esta proposta já passou da validade.', 'PROPOSAL_EXPIRED');
    }
    this.decide('ACCEPTED', now);
  }

  reject(reason: string, now: Date): void {
    this.assertPending('recusar');
    const trimmed = reason.trim();
    if (!trimmed) throw new ValidationError('Informe o motivo da recusa.');
    this.props.rejectionReason = trimmed;
    this.decide('REJECTED', now);
  }

  /**
   * O comprador desistiu. Vale para proposta pendente ou já aceita
   * (neste caso o imóvel reservado precisa ser liberado por quem chamou).
   */
  cancel(now: Date): { wasAccepted: boolean } {
    if (this.props.status !== 'PENDING' && this.props.status !== 'ACCEPTED') {
      throw new BusinessRuleError('Esta proposta já foi encerrada.', 'PROPOSAL_ALREADY_CLOSED');
    }
    const wasAccepted = this.props.status === 'ACCEPTED';
    this.decide('CANCELED', now);
    return { wasAccepted };
  }

  private decide(status: ProposalStatus, now: Date): void {
    this.props.status = status;
    this.props.decidedAt = now;
    this.props.updatedAt = now;
  }
}
