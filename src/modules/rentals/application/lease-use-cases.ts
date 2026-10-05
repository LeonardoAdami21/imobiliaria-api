import { type Clock, mapPage, type Page, type UnitOfWork, type UseCase } from '@/shared/application/contracts';
import { formatDate, isBefore, startOfMonth } from '@/shared/domain/dates';
import { BusinessRuleError, NotFoundError } from '@/shared/domain/errors';
import { Money } from '@/shared/domain/money';
import type { PersonDirectory } from '@/modules/crm/contracts';
import type { PropertyRegistry } from '@/modules/properties/contracts';
import { type AdjustmentIndex, type GuaranteeType, Lease, type LeaseStatus } from '../domain/lease';
import type { LeaseFilters, LeaseRepository, RentChargeRepository } from '../domain/repositories';

export interface LeaseOutput {
  id: string;
  propertyId: string;
  tenantId: string;
  ownerId: string;
  guarantorId: string | null;
  startDate: string;
  endDate: string;
  durationMonths: number;
  rentAmountCents: number;
  dueDay: number;
  adminFeePercent: number;
  lateFeePercent: number;
  monthlyInterestPercent: number;
  guaranteeType: GuaranteeType;
  depositAmountCents: number | null;
  adjustmentIndex: AdjustmentIndex;
  lastAdjustmentAt: string | null;
  nextAdjustmentDate: string;
  status: LeaseStatus;
  terminatedAt: string | null;
  terminationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toLeaseOutput(lease: Lease): LeaseOutput {
  return {
    id: lease.id,
    propertyId: lease.propertyId,
    tenantId: lease.tenantId,
    ownerId: lease.ownerId,
    guarantorId: lease.guarantorId,
    startDate: formatDate(lease.startDate),
    endDate: formatDate(lease.endDate),
    durationMonths: lease.durationMonths,
    rentAmountCents: lease.rentAmount.cents,
    dueDay: lease.dueDay,
    ...lease.terms,
    guaranteeType: lease.guaranteeType,
    depositAmountCents: lease.depositAmount?.cents ?? null,
    adjustmentIndex: lease.adjustmentIndex,
    lastAdjustmentAt: lease.lastAdjustmentAt && formatDate(lease.lastAdjustmentAt),
    nextAdjustmentDate: formatDate(lease.nextAdjustmentDate),
    status: lease.status,
    terminatedAt: lease.terminatedAt && formatDate(lease.terminatedAt),
    terminationReason: lease.terminationReason,
    createdAt: lease.createdAt,
    updatedAt: lease.updatedAt,
  };
}

export interface CreateLeaseInput {
  propertyId: string;
  tenantId: string;
  guarantorId?: string | null;
  startDate: Date;
  durationMonths: number;
  rentAmountCents: number;
  dueDay: number;
  adminFeePercent: number;
  lateFeePercent: number;
  monthlyInterestPercent: number;
  guaranteeType: GuaranteeType;
  depositAmountCents?: number | null;
  adjustmentIndex: AdjustmentIndex;
}

/**
 * Assinatura do contrato: cria o contrato, gera todas as cobranças mensais
 * e marca o imóvel como alugado. Tudo na mesma transação.
 */
export class CreateLease implements UseCase<CreateLeaseInput, LeaseOutput> {
  constructor(
    private readonly leases: LeaseRepository,
    private readonly charges: RentChargeRepository,
    private readonly properties: PropertyRegistry,
    private readonly people: PersonDirectory,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: CreateLeaseInput): Promise<LeaseOutput> {
    const property = await this.properties.findProperty(input.propertyId);
    if (!property) throw new NotFoundError('Imóvel');
    if (!(await this.people.findPerson(input.tenantId))) throw new NotFoundError('Inquilino');
    if (input.guarantorId && !(await this.people.findPerson(input.guarantorId))) throw new NotFoundError('Fiador');

    const lease = Lease.create({
      propertyId: property.id,
      ownerId: property.ownerId,
      tenantId: input.tenantId,
      guarantorId: input.guarantorId ?? null,
      startDate: input.startDate,
      durationMonths: input.durationMonths,
      rentAmount: Money.fromCents(input.rentAmountCents),
      dueDay: input.dueDay,
      adminFeePercent: input.adminFeePercent,
      lateFeePercent: input.lateFeePercent,
      monthlyInterestPercent: input.monthlyInterestPercent,
      guaranteeType: input.guaranteeType,
      depositAmount: input.depositAmountCents == null ? null : Money.fromCents(input.depositAmountCents),
      adjustmentIndex: input.adjustmentIndex,
    });

    await this.uow.run(async () => {
      // A regra "só imóvel disponível e para locação pode ser alugado" está no agregado Property.
      await this.properties.markAsRented(property.id);
      await this.leases.save(lease);
      await this.charges.saveAll(lease.generateCharges());
    });
    return toLeaseOutput(lease);
  }
}

export interface AdjustRentInput {
  id: string;
  /** Percentual do reajuste: 4.5 para +4,5%. */
  percent: number;
  /** Data a partir da qual vale o novo valor. Padrão: hoje. */
  effectiveFrom?: Date;
}

/** Reajuste anual: muda o aluguel do contrato e o valor das cobranças ainda não pagas a partir do mês de vigência. */
export class AdjustRent implements UseCase<AdjustRentInput, LeaseOutput> {
  constructor(
    private readonly leases: LeaseRepository,
    private readonly charges: RentChargeRepository,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(input: AdjustRentInput): Promise<LeaseOutput> {
    const lease = await this.leases.findById(input.id);
    if (!lease) throw new NotFoundError('Contrato de locação');

    const effectiveFrom = input.effectiveFrom ?? this.clock.today();
    const newRent = lease.adjustRent(input.percent, effectiveFrom);

    const firstAffectedMonth = startOfMonth(effectiveFrom);
    const affected = (await this.charges.findPendingByLease(lease.id)).filter(
      (charge) => !isBefore(charge.referenceMonth, firstAffectedMonth),
    );
    for (const charge of affected) charge.changeAmount(newRent);

    await this.uow.run(async () => {
      await this.leases.save(lease);
      await this.charges.saveAll(affected);
    });
    return toLeaseOutput(lease);
  }
}

export interface CloseLeaseInput {
  id: string;
  /** Data da entrega das chaves. Padrão: hoje. */
  date?: Date;
  reason?: string | null;
}

/**
 * Encerramento ou rescisão: fecha o contrato, cancela as cobranças dos meses
 * seguintes ao da saída e devolve o imóvel ao mercado.
 */
export class CloseLease implements UseCase<CloseLeaseInput, LeaseOutput> {
  constructor(
    private readonly leases: LeaseRepository,
    private readonly charges: RentChargeRepository,
    private readonly properties: PropertyRegistry,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(input: CloseLeaseInput): Promise<LeaseOutput> {
    const lease = await this.leases.findById(input.id);
    if (!lease) throw new NotFoundError('Contrato de locação');

    const date = input.date ?? this.clock.today();
    if (isBefore(this.clock.today(), date)) {
      throw new BusinessRuleError('A data de encerramento não pode estar no futuro.', 'CLOSING_DATE_IN_THE_FUTURE');
    }
    lease.close(date, input.reason);

    const lastChargedMonth = startOfMonth(date);
    const canceled = (await this.charges.findPendingByLease(lease.id)).filter((charge) =>
      isBefore(lastChargedMonth, charge.referenceMonth),
    );
    for (const charge of canceled) charge.cancel();

    await this.uow.run(async () => {
      await this.leases.save(lease);
      await this.charges.saveAll(canceled);
      await this.properties.release(lease.propertyId);
    });
    return toLeaseOutput(lease);
  }
}

export class GetLease implements UseCase<{ id: string }, LeaseOutput> {
  constructor(private readonly leases: LeaseRepository) {}

  async execute({ id }: { id: string }): Promise<LeaseOutput> {
    const lease = await this.leases.findById(id);
    if (!lease) throw new NotFoundError('Contrato de locação');
    return toLeaseOutput(lease);
  }
}

export class SearchLeases implements UseCase<LeaseFilters, Page<LeaseOutput>> {
  constructor(private readonly leases: LeaseRepository) {}

  async execute(filters: LeaseFilters): Promise<Page<LeaseOutput>> {
    return mapPage(await this.leases.search(filters), toLeaseOutput);
  }
}
