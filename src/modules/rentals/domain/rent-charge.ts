import { daysBetween, isBefore } from '@/shared/domain/dates';
import { AggregateRoot, newId } from '@/shared/domain/entity';
import { BusinessRuleError, ValidationError } from '@/shared/domain/errors';
import { Money } from '@/shared/domain/money';

export const CHARGE_STATUSES = ['PENDING', 'PAID', 'CANCELED'] as const;
/** "Atrasada" não é um status gravado: é uma cobrança pendente com vencimento anterior a hoje. */
export type ChargeStatus = (typeof CHARGE_STATUSES)[number];

export const TRANSFER_STATUSES = ['PENDING', 'DONE'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

/** Condições do contrato que entram no cálculo de um pagamento. */
export interface LeaseTerms {
  /** Taxa de administração da imobiliária, em % sobre o valor recebido. */
  adminFeePercent: number;
  /** Multa por atraso, em % sobre o aluguel, cobrada uma única vez. */
  lateFeePercent: number;
  /** Juros de mora, em % ao mês, proporcionais aos dias de atraso. */
  monthlyInterestPercent: number;
}

/** Quanto custa quitar a cobrança em uma determinada data. */
export interface ChargeQuote {
  daysLate: number;
  lateFee: Money;
  interest: Money;
  total: Money;
}

/** Registro do pagamento e do repasse ao proprietário. */
export interface ChargePayment {
  paidAt: Date;
  lateFee: Money;
  interest: Money;
  paidAmount: Money;
  /** Parte da imobiliária. */
  adminFee: Money;
  /** Parte do proprietário: valor pago menos a taxa de administração. */
  ownerTransfer: Money;
  transferStatus: TransferStatus;
  transferredAt: Date | null;
}

export interface RentChargeProps {
  leaseId: string;
  /** Primeiro dia do mês de competência (o mês de uso do imóvel). */
  referenceMonth: Date;
  dueDate: Date;
  amount: Money;
  status: ChargeStatus;
  payment: ChargePayment | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Cobrança mensal de aluguel. Cada uma é paga e repassada de forma independente. */
export class RentCharge extends AggregateRoot<RentChargeProps> {
  static create(input: { leaseId: string; referenceMonth: Date; dueDate: Date; amount: Money }): RentCharge {
    const now = new Date();
    return new RentCharge(newId(), { ...input, status: 'PENDING', payment: null, createdAt: now, updatedAt: now });
  }

  static restore(id: string, props: RentChargeProps): RentCharge {
    return new RentCharge(id, props);
  }

  get leaseId(): string { return this.props.leaseId; }
  get referenceMonth(): Date { return this.props.referenceMonth; }
  get dueDate(): Date { return this.props.dueDate; }
  get amount(): Money { return this.props.amount; }
  get status(): ChargeStatus { return this.props.status; }
  get payment(): ChargePayment | null { return this.props.payment; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  isOverdue(today: Date): boolean {
    return this.props.status === 'PENDING' && isBefore(this.props.dueDate, today);
  }

  private assertPending(action: string): void {
    if (this.props.status !== 'PENDING') {
      throw new BusinessRuleError(`Só é possível ${action} uma cobrança pendente.`, 'CHARGE_NOT_PENDING');
    }
  }

  /**
   * Valor para quitar em `date`. Em dia: só o aluguel. Em atraso: aluguel + multa
   * (percentual único) + juros de mora proporcionais aos dias corridos (mês de 30 dias).
   */
  quote(date: Date, terms: LeaseTerms): ChargeQuote {
    const daysLate = Math.max(0, daysBetween(this.props.dueDate, date));
    const lateFee = daysLate > 0 ? this.props.amount.percentage(terms.lateFeePercent) : Money.zero();
    const interest = this.props.amount.percentage((terms.monthlyInterestPercent * daysLate) / 30);
    return { daysLate, lateFee, interest, total: this.props.amount.add(lateFee).add(interest) };
  }

  pay(paidAt: Date, terms: LeaseTerms): void {
    this.assertPending('pagar');
    const { lateFee, interest, total } = this.quote(paidAt, terms);
    const adminFee = total.percentage(terms.adminFeePercent);
    this.props.status = 'PAID';
    this.props.payment = {
      paidAt,
      lateFee,
      interest,
      paidAmount: total,
      adminFee,
      ownerTransfer: total.subtract(adminFee),
      transferStatus: 'PENDING',
      transferredAt: null,
    };
    this.touch();
  }

  /** Registra que o valor do proprietário foi repassado a ele. */
  registerTransfer(date: Date): void {
    const payment = this.props.payment;
    if (this.props.status !== 'PAID' || !payment) {
      throw new BusinessRuleError('Só é possível repassar uma cobrança já paga.', 'CHARGE_NOT_PAID');
    }
    if (payment.transferStatus === 'DONE') {
      throw new BusinessRuleError('O repasse desta cobrança já foi realizado.', 'TRANSFER_ALREADY_DONE');
    }
    if (isBefore(date, payment.paidAt)) {
      throw new ValidationError('A data do repasse não pode ser anterior à data do pagamento.');
    }
    this.props.payment = { ...payment, transferStatus: 'DONE', transferredAt: date };
    this.touch();
  }

  cancel(): void {
    this.assertPending('cancelar');
    this.props.status = 'CANCELED';
    this.touch();
  }

  /** Usado no reajuste anual: muda o valor das cobranças que ainda não foram pagas. */
  changeAmount(amount: Money): void {
    this.assertPending('alterar o valor de');
    this.props.amount = amount;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
