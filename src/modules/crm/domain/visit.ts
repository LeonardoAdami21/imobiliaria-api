import { AggregateRoot, newId } from '@/shared/domain/entity';
import { BusinessRuleError } from '@/shared/domain/errors';

export const VISIT_STATUSES = ['SCHEDULED', 'DONE', 'CANCELED', 'NO_SHOW'] as const;
/** Agendada, realizada, cancelada ou cliente não compareceu. */
export type VisitStatus = (typeof VISIT_STATUSES)[number];

/** Tempo reservado para cada visita; duas visitas não podem se sobrepor nessa janela. */
export const VISIT_DURATION_MINUTES = 60;

export interface VisitProps {
  leadId: string;
  propertyId: string;
  brokerId: string;
  scheduledAt: Date;
  status: VisitStatus;
  feedback: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Visita de um lead a um imóvel, acompanhada por um corretor. */
export class Visit extends AggregateRoot<VisitProps> {
  static schedule(
    input: { leadId: string; propertyId: string; brokerId: string; scheduledAt: Date },
    now: Date,
  ): Visit {
    Visit.assertFuture(input.scheduledAt, now);
    return new Visit(newId(), { ...input, status: 'SCHEDULED', feedback: null, createdAt: now, updatedAt: now });
  }

  static restore(id: string, props: VisitProps): Visit {
    return new Visit(id, props);
  }

  private static assertFuture(scheduledAt: Date, now: Date): void {
    if (scheduledAt.getTime() <= now.getTime()) {
      throw new BusinessRuleError('A visita deve ser agendada para uma data futura.', 'VISIT_IN_THE_PAST');
    }
  }

  get leadId(): string { return this.props.leadId; }
  get propertyId(): string { return this.props.propertyId; }
  get brokerId(): string { return this.props.brokerId; }
  get scheduledAt(): Date { return this.props.scheduledAt; }
  get status(): VisitStatus { return this.props.status; }
  get feedback(): string | null { return this.props.feedback; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  private assertScheduled(): void {
    if (this.props.status !== 'SCHEDULED') {
      throw new BusinessRuleError('Só é possível alterar visitas que ainda estão agendadas.', 'VISIT_NOT_SCHEDULED');
    }
  }

  reschedule(scheduledAt: Date, now: Date): void {
    this.assertScheduled();
    Visit.assertFuture(scheduledAt, now);
    this.props.scheduledAt = scheduledAt;
    this.props.updatedAt = now;
  }

  /** Encerra a visita registrando o que aconteceu. */
  finish(outcome: 'DONE' | 'CANCELED' | 'NO_SHOW', feedback: string | null, now: Date): void {
    this.assertScheduled();
    this.props.status = outcome;
    this.props.feedback = feedback?.trim() || null;
    this.props.updatedAt = now;
  }
}
