import { isBefore } from '@/shared/domain/dates';
import { AggregateRoot, newId } from '@/shared/domain/entity';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/shared/domain/errors';
import { assertPercent, Money } from '@/shared/domain/money';

export const COMMISSION_ROLES = ['LISTING_BROKER', 'SELLING_BROKER', 'AGENCY'] as const;
/** Corretor captador (trouxe o imóvel), corretor vendedor (trouxe o comprador) e a imobiliária. */
export type CommissionRole = (typeof COMMISSION_ROLES)[number];

export const COMMISSION_STATUSES = ['PENDING', 'PAID'] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

/** Parcela da comissão devida a um participante da venda. Entidade interna do agregado Sale. */
export interface Commission {
  id: string;
  role: CommissionRole;
  /** Nulo para a parte da imobiliária. */
  brokerId: string | null;
  /** Fatia da comissão total, em %. */
  sharePercent: number;
  amount: Money;
  status: CommissionStatus;
  paidAt: Date | null;
}

export interface SaleProps {
  proposalId: string;
  propertyId: string;
  buyerId: string;
  sellerId: string;
  amount: Money;
  /** Comissão da imobiliária sobre o valor da venda, em %. */
  commissionPercent: number;
  commissionAmount: Money;
  closedAt: Date;
  commissions: Commission[];
  createdAt: Date;
}

export interface CloseSaleInput {
  proposalId: string;
  propertyId: string;
  buyerId: string;
  sellerId: string;
  amount: Money;
  closedAt: Date;
  commissionPercent: number;
  sellingBrokerId: string;
  /** Quanto da comissão vai para o corretor vendedor, em %. */
  sellingBrokerSharePercent: number;
  /** Corretor captador do imóvel, se houver. */
  listingBrokerId: string | null;
  /** Quanto da comissão vai para o corretor captador, em %. Ignorado se não houver captador. */
  listingBrokerSharePercent: number;
}

/**
 * Venda concluída. Calcula a comissão e a divide entre captador, vendedor
 * e imobiliária; a soma das partes é sempre exatamente a comissão total.
 */
export class Sale extends AggregateRoot<SaleProps> {
  static close(input: CloseSaleInput): Sale {
    const commissionPercent = assertPercent(input.commissionPercent, 'Comissão');
    const sellingShare = assertPercent(input.sellingBrokerSharePercent, 'Parte do corretor vendedor');
    const listingShare = input.listingBrokerId
      ? assertPercent(input.listingBrokerSharePercent, 'Parte do corretor captador')
      : 0;
    if (sellingShare + listingShare > 100) {
      throw new BusinessRuleError('A soma das partes dos corretores não pode passar de 100% da comissão.', 'INVALID_COMMISSION_SPLIT');
    }

    const commissionAmount = input.amount.percentage(commissionPercent);
    const agencyShare = Math.round((100 - sellingShare - listingShare) * 100) / 100;

    const parts: { role: CommissionRole; brokerId: string | null; sharePercent: number }[] = [];
    if (input.listingBrokerId && listingShare > 0) {
      parts.push({ role: 'LISTING_BROKER', brokerId: input.listingBrokerId, sharePercent: listingShare });
    }
    if (sellingShare > 0) parts.push({ role: 'SELLING_BROKER', brokerId: input.sellingBrokerId, sharePercent: sellingShare });
    if (agencyShare > 0) parts.push({ role: 'AGENCY', brokerId: null, sharePercent: agencyShare });

    // Cada parte é arredondada para baixo (conta em inteiros, sem ponto flutuante) e os
    // centavos que sobram vão para a última parte: a imobiliária, quando ela participa.
    const amounts = parts.map((part) =>
      Math.floor((commissionAmount.cents * Math.round(part.sharePercent * 100)) / 10_000),
    );
    const leftover = commissionAmount.cents - amounts.reduce((sum, cents) => sum + cents, 0);
    if (amounts.length > 0) amounts[amounts.length - 1]! += leftover;

    const commissions: Commission[] = parts.map((part, index) => ({
      id: newId(),
      ...part,
      amount: Money.fromCents(amounts[index]!),
      status: 'PENDING',
      paidAt: null,
    }));

    return new Sale(newId(), {
      proposalId: input.proposalId,
      propertyId: input.propertyId,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      amount: input.amount,
      commissionPercent,
      commissionAmount,
      closedAt: input.closedAt,
      commissions,
      createdAt: new Date(),
    });
  }

  static restore(id: string, props: SaleProps): Sale {
    return new Sale(id, props);
  }

  get proposalId(): string { return this.props.proposalId; }
  get propertyId(): string { return this.props.propertyId; }
  get buyerId(): string { return this.props.buyerId; }
  get sellerId(): string { return this.props.sellerId; }
  get amount(): Money { return this.props.amount; }
  get commissionPercent(): number { return this.props.commissionPercent; }
  get commissionAmount(): Money { return this.props.commissionAmount; }
  get closedAt(): Date { return this.props.closedAt; }
  get commissions(): readonly Commission[] { return this.props.commissions; }
  get createdAt(): Date { return this.props.createdAt; }

  payCommission(commissionId: string, paidAt: Date): Commission {
    const commission = this.props.commissions.find((item) => item.id === commissionId);
    if (!commission) throw new NotFoundError('Comissão');
    if (commission.status === 'PAID') {
      throw new BusinessRuleError('Esta comissão já foi paga.', 'COMMISSION_ALREADY_PAID');
    }
    if (isBefore(paidAt, this.props.closedAt)) {
      throw new ValidationError('A comissão não pode ser paga antes da data da venda.');
    }
    commission.status = 'PAID';
    commission.paidAt = paidAt;
    return commission;
  }
}
