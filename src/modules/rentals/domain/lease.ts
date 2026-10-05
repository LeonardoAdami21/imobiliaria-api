import { addDays, addMonths, isBefore, startOfMonth, withDay } from '@/shared/domain/dates';
import { AggregateRoot, newId } from '@/shared/domain/entity';
import { BusinessRuleError, ValidationError } from '@/shared/domain/errors';
import { assertPercent, type Money } from '@/shared/domain/money';
import { type LeaseTerms, RentCharge } from './rent-charge';

export const LEASE_STATUSES = ['ACTIVE', 'ENDED', 'TERMINATED'] as const;
/** Ativo, encerrado no fim do prazo ou rescindido antes do prazo. */
export type LeaseStatus = (typeof LEASE_STATUSES)[number];

export const GUARANTEE_TYPES = ['NONE', 'GUARANTOR', 'DEPOSIT', 'SURETY_INSURANCE'] as const;
/** Sem garantia, fiador, caução em dinheiro ou seguro-fiança. */
export type GuaranteeType = (typeof GUARANTEE_TYPES)[number];

export const ADJUSTMENT_INDEXES = ['IGPM', 'IPCA', 'INPC', 'FIXED'] as const;
export type AdjustmentIndex = (typeof ADJUSTMENT_INDEXES)[number];

/** A Lei do Inquilinato limita a caução em dinheiro a três meses de aluguel (art. 38, §2º). */
export const MAX_DEPOSIT_IN_RENTS = 3;
/** O reajuste do aluguel só pode acontecer uma vez a cada 12 meses (Lei 10.192/2001). */
export const MONTHS_BETWEEN_ADJUSTMENTS = 12;

export interface LeaseProps extends LeaseTerms {
  propertyId: string;
  tenantId: string;
  ownerId: string;
  guarantorId: string | null;
  startDate: Date;
  endDate: Date;
  durationMonths: number;
  rentAmount: Money;
  dueDay: number;
  guaranteeType: GuaranteeType;
  depositAmount: Money | null;
  adjustmentIndex: AdjustmentIndex;
  lastAdjustmentAt: Date | null;
  status: LeaseStatus;
  terminatedAt: Date | null;
  terminationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLeaseInput extends LeaseTerms {
  propertyId: string;
  tenantId: string;
  ownerId: string;
  guarantorId: string | null;
  startDate: Date;
  durationMonths: number;
  rentAmount: Money;
  dueDay: number;
  guaranteeType: GuaranteeType;
  depositAmount: Money | null;
  adjustmentIndex: AdjustmentIndex;
}

/** Contrato de locação entre o proprietário (locador) e o inquilino (locatário). */
export class Lease extends AggregateRoot<LeaseProps> {
  static create(input: CreateLeaseInput): Lease {
    if (!Number.isInteger(input.durationMonths) || input.durationMonths < 1 || input.durationMonths > 120) {
      throw new ValidationError('O prazo do contrato deve ser de 1 a 120 meses.');
    }
    // Limitar a 28 garante que o dia de vencimento exista em todos os meses, inclusive fevereiro.
    if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 28) {
      throw new ValidationError('O dia de vencimento deve estar entre 1 e 28.');
    }
    if (input.rentAmount.isZero()) throw new ValidationError('O valor do aluguel deve ser maior que zero.');
    if (input.tenantId === input.ownerId) {
      throw new BusinessRuleError('O inquilino não pode ser o próprio proprietário do imóvel.', 'TENANT_IS_OWNER');
    }

    const guarantorId = input.guaranteeType === 'GUARANTOR' ? input.guarantorId : null;
    if (input.guaranteeType === 'GUARANTOR') {
      if (!guarantorId) throw new BusinessRuleError('Garantia por fiador exige informar o fiador.', 'GUARANTOR_REQUIRED');
      if (guarantorId === input.tenantId || guarantorId === input.ownerId) {
        throw new BusinessRuleError('O fiador não pode ser o inquilino nem o proprietário.', 'INVALID_GUARANTOR');
      }
    }

    const depositAmount = input.guaranteeType === 'DEPOSIT' ? input.depositAmount : null;
    if (input.guaranteeType === 'DEPOSIT') {
      if (!depositAmount || depositAmount.isZero()) {
        throw new BusinessRuleError('Garantia por caução exige informar o valor depositado.', 'DEPOSIT_REQUIRED');
      }
      if (depositAmount.greaterThan(input.rentAmount.multiply(MAX_DEPOSIT_IN_RENTS))) {
        throw new BusinessRuleError(
          `A caução não pode passar de ${MAX_DEPOSIT_IN_RENTS} meses de aluguel.`,
          'DEPOSIT_ABOVE_LEGAL_LIMIT',
        );
      }
    }

    const now = new Date();
    return new Lease(newId(), {
      ...input,
      guarantorId,
      depositAmount,
      adminFeePercent: assertPercent(input.adminFeePercent, 'Taxa de administração'),
      lateFeePercent: assertPercent(input.lateFeePercent, 'Multa por atraso', 20),
      monthlyInterestPercent: assertPercent(input.monthlyInterestPercent, 'Juros de mora', 10),
      endDate: addDays(addMonths(input.startDate, input.durationMonths), -1),
      lastAdjustmentAt: null,
      status: 'ACTIVE',
      terminatedAt: null,
      terminationReason: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(id: string, props: LeaseProps): Lease {
    return new Lease(id, props);
  }

  get propertyId(): string { return this.props.propertyId; }
  get tenantId(): string { return this.props.tenantId; }
  get ownerId(): string { return this.props.ownerId; }
  get guarantorId(): string | null { return this.props.guarantorId; }
  get startDate(): Date { return this.props.startDate; }
  get endDate(): Date { return this.props.endDate; }
  get durationMonths(): number { return this.props.durationMonths; }
  get rentAmount(): Money { return this.props.rentAmount; }
  get dueDay(): number { return this.props.dueDay; }
  get guaranteeType(): GuaranteeType { return this.props.guaranteeType; }
  get depositAmount(): Money | null { return this.props.depositAmount; }
  get adjustmentIndex(): AdjustmentIndex { return this.props.adjustmentIndex; }
  get lastAdjustmentAt(): Date | null { return this.props.lastAdjustmentAt; }
  get status(): LeaseStatus { return this.props.status; }
  get terminatedAt(): Date | null { return this.props.terminatedAt; }
  get terminationReason(): string | null { return this.props.terminationReason; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  get terms(): LeaseTerms {
    const { adminFeePercent, lateFeePercent, monthlyInterestPercent } = this.props;
    return { adminFeePercent, lateFeePercent, monthlyInterestPercent };
  }

  /** Data a partir da qual o próximo reajuste é permitido. */
  get nextAdjustmentDate(): Date {
    return addMonths(this.props.lastAdjustmentAt ?? this.props.startDate, MONTHS_BETWEEN_ADJUSTMENTS);
  }

  private assertActive(): void {
    if (this.props.status !== 'ACTIVE') {
      throw new BusinessRuleError('Esta operação só é permitida em contrato ativo.', 'LEASE_NOT_ACTIVE');
    }
  }

  /**
   * Gera uma cobrança por mês de contrato. O aluguel é pago depois do uso:
   * a competência de janeiro vence no dia de vencimento de fevereiro.
   */
  generateCharges(): RentCharge[] {
    const firstMonth = startOfMonth(this.props.startDate);
    return Array.from({ length: this.props.durationMonths }, (_, index) => {
      const referenceMonth = addMonths(firstMonth, index);
      return RentCharge.create({
        leaseId: this.id,
        referenceMonth,
        dueDate: withDay(addMonths(referenceMonth, 1), this.props.dueDay),
        amount: this.props.rentAmount,
      });
    });
  }

  /** Aplica o reajuste (ex.: 4.5 para +4,5%) e devolve o novo valor do aluguel. */
  adjustRent(percent: number, effectiveFrom: Date): Money {
    this.assertActive();
    if (!Number.isFinite(percent) || percent === 0 || percent <= -100 || percent > 100) {
      throw new ValidationError('O percentual de reajuste deve ser diferente de zero e estar entre -100% e 100%.');
    }
    if (isBefore(effectiveFrom, this.nextAdjustmentDate)) {
      throw new BusinessRuleError(
        `O aluguel só pode ser reajustado a cada ${MONTHS_BETWEEN_ADJUSTMENTS} meses.`,
        'ADJUSTMENT_BEFORE_ANNIVERSARY',
      );
    }
    if (isBefore(this.props.endDate, effectiveFrom)) {
      throw new BusinessRuleError('O reajuste não pode valer depois do fim do contrato.', 'ADJUSTMENT_AFTER_END');
    }
    this.props.rentAmount = this.props.rentAmount.multiply(1 + percent / 100);
    this.props.lastAdjustmentAt = effectiveFrom;
    this.touch();
    return this.props.rentAmount;
  }

  /**
   * Encerra o contrato. Antes do fim do prazo é uma rescisão (exige motivo);
   * a partir do último dia do prazo é o encerramento normal.
   */
  close(date: Date, reason?: string | null): void {
    this.assertActive();
    if (isBefore(date, this.props.startDate)) {
      throw new ValidationError('A data de encerramento não pode ser anterior ao início do contrato.');
    }
    const early = isBefore(date, this.props.endDate);
    const trimmed = reason?.trim() || null;
    if (early && !trimmed) {
      throw new BusinessRuleError('Rescisão antes do fim do prazo exige informar o motivo.', 'TERMINATION_REASON_REQUIRED');
    }
    this.props.status = early ? 'TERMINATED' : 'ENDED';
    this.props.terminatedAt = date;
    this.props.terminationReason = trimmed;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
