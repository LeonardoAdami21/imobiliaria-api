import { type Clock, mapPage, type Page, type UseCase } from '@/shared/application/contracts';
import { formatDate, isBefore } from '@/shared/domain/dates';
import { BusinessRuleError, NotFoundError } from '@/shared/domain/errors';
import type { ChargeFilters, LeaseRepository, RentChargeRepository } from '../domain/repositories';
import type { ChargeStatus, RentCharge, TransferStatus } from '../domain/rent-charge';

export interface ChargeOutput {
  id: string;
  leaseId: string;
  /** Mês de competência, no formato AAAA-MM. */
  referenceMonth: string;
  dueDate: string;
  amountCents: number;
  status: ChargeStatus;
  /** Pendente e com vencimento anterior a hoje. */
  overdue: boolean;
  payment: {
    paidAt: string;
    lateFeeCents: number;
    interestCents: number;
    paidAmountCents: number;
    adminFeeCents: number;
    ownerTransferCents: number;
    transferStatus: TransferStatus;
    transferredAt: string | null;
  } | null;
}

export function toChargeOutput(charge: RentCharge, today: Date): ChargeOutput {
  const payment = charge.payment;
  return {
    id: charge.id,
    leaseId: charge.leaseId,
    referenceMonth: formatDate(charge.referenceMonth).slice(0, 7),
    dueDate: formatDate(charge.dueDate),
    amountCents: charge.amount.cents,
    status: charge.status,
    overdue: charge.isOverdue(today),
    payment: payment && {
      paidAt: formatDate(payment.paidAt),
      lateFeeCents: payment.lateFee.cents,
      interestCents: payment.interest.cents,
      paidAmountCents: payment.paidAmount.cents,
      adminFeeCents: payment.adminFee.cents,
      ownerTransferCents: payment.ownerTransfer.cents,
      transferStatus: payment.transferStatus,
      transferredAt: payment.transferredAt && formatDate(payment.transferredAt),
    },
  };
}

export interface SearchChargesInput extends Omit<ChargeFilters, 'overdueBefore'> {
  /** true = só as atrasadas. */
  overdue?: boolean;
}

export class SearchCharges implements UseCase<SearchChargesInput, Page<ChargeOutput>> {
  constructor(
    private readonly charges: RentChargeRepository,
    private readonly clock: Clock,
  ) {}

  async execute({ overdue, ...filters }: SearchChargesInput): Promise<Page<ChargeOutput>> {
    const today = this.clock.today();
    const page = await this.charges.search({ ...filters, overdueBefore: overdue ? today : undefined });
    return mapPage(page, (charge) => toChargeOutput(charge, today));
  }
}

export interface ChargeQuoteOutput {
  chargeId: string;
  date: string;
  daysLate: number;
  amountCents: number;
  lateFeeCents: number;
  interestCents: number;
  totalCents: number;
}

/** Quanto o inquilino paga se quitar a cobrança em determinada data (boleto atualizado). */
export class QuoteCharge implements UseCase<{ id: string; date?: Date }, ChargeQuoteOutput> {
  constructor(
    private readonly charges: RentChargeRepository,
    private readonly leases: LeaseRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: { id: string; date?: Date }): Promise<ChargeQuoteOutput> {
    const charge = await this.charges.findById(input.id);
    if (!charge) throw new NotFoundError('Cobrança');
    const lease = await this.leases.findById(charge.leaseId);
    if (!lease) throw new NotFoundError('Contrato de locação');

    const date = input.date ?? this.clock.today();
    const quote = charge.quote(date, lease.terms);
    return {
      chargeId: charge.id,
      date: formatDate(date),
      daysLate: quote.daysLate,
      amountCents: charge.amount.cents,
      lateFeeCents: quote.lateFee.cents,
      interestCents: quote.interest.cents,
      totalCents: quote.total.cents,
    };
  }
}

/** Baixa do pagamento: calcula multa e juros, a taxa de administração e o valor a repassar. */
export class PayCharge implements UseCase<{ id: string; paidAt?: Date }, ChargeOutput> {
  constructor(
    private readonly charges: RentChargeRepository,
    private readonly leases: LeaseRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: { id: string; paidAt?: Date }): Promise<ChargeOutput> {
    const charge = await this.charges.findById(input.id);
    if (!charge) throw new NotFoundError('Cobrança');
    const lease = await this.leases.findById(charge.leaseId);
    if (!lease) throw new NotFoundError('Contrato de locação');

    const today = this.clock.today();
    const paidAt = input.paidAt ?? today;
    if (isBefore(today, paidAt)) {
      throw new BusinessRuleError('A data do pagamento não pode estar no futuro.', 'PAYMENT_IN_THE_FUTURE');
    }
    charge.pay(paidAt, lease.terms);
    await this.charges.save(charge);
    return toChargeOutput(charge, today);
  }
}

/** Registra o repasse do valor líquido ao proprietário. */
export class RegisterOwnerTransfer implements UseCase<{ id: string; date?: Date }, ChargeOutput> {
  constructor(
    private readonly charges: RentChargeRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: { id: string; date?: Date }): Promise<ChargeOutput> {
    const charge = await this.charges.findById(input.id);
    if (!charge) throw new NotFoundError('Cobrança');

    const today = this.clock.today();
    const date = input.date ?? today;
    if (isBefore(today, date)) {
      throw new BusinessRuleError('A data do repasse não pode estar no futuro.', 'TRANSFER_IN_THE_FUTURE');
    }
    charge.registerTransfer(date);
    await this.charges.save(charge);
    return toChargeOutput(charge, today);
  }
}
