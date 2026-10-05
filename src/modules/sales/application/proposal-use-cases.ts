import { type Clock, mapPage, type Page, type UnitOfWork, type UseCase } from '@/shared/application/contracts';
import { formatDate } from '@/shared/domain/dates';
import { BusinessRuleError, NotFoundError } from '@/shared/domain/errors';
import { Money } from '@/shared/domain/money';
import type { PersonDirectory } from '@/modules/crm/contracts';
import type { UserDirectory } from '@/modules/identity/contracts';
import type { PropertyRegistry } from '@/modules/properties/contracts';
import { Proposal, type ProposalStatus } from '../domain/proposal';
import type { ProposalFilters, ProposalRepository } from '../domain/repositories';

export interface ProposalOutput {
  id: string;
  propertyId: string;
  buyerId: string;
  brokerId: string;
  amountCents: number;
  paymentTerms: string | null;
  validUntil: string | null;
  status: ProposalStatus;
  decidedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toProposalOutput(proposal: Proposal): ProposalOutput {
  return {
    id: proposal.id,
    propertyId: proposal.propertyId,
    buyerId: proposal.buyerId,
    brokerId: proposal.brokerId,
    amountCents: proposal.amount.cents,
    paymentTerms: proposal.paymentTerms,
    validUntil: proposal.validUntil && formatDate(proposal.validUntil),
    status: proposal.status,
    decidedAt: proposal.decidedAt,
    rejectionReason: proposal.rejectionReason,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
  };
}

export interface CreateProposalInput {
  propertyId: string;
  buyerId: string;
  brokerId: string;
  amountCents: number;
  paymentTerms?: string | null;
  validUntil?: Date | null;
}

export class CreateProposal implements UseCase<CreateProposalInput, ProposalOutput> {
  constructor(
    private readonly proposals: ProposalRepository,
    private readonly properties: PropertyRegistry,
    private readonly people: PersonDirectory,
    private readonly users: UserDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateProposalInput): Promise<ProposalOutput> {
    const property = await this.properties.findProperty(input.propertyId);
    if (!property) throw new NotFoundError('Imóvel');
    if (!property.forSale) throw new BusinessRuleError('Este imóvel não está à venda.', 'PROPERTY_NOT_FOR_SALE');
    if (property.status !== 'AVAILABLE') {
      throw new BusinessRuleError('Só é possível fazer proposta para imóvel disponível.', 'PROPERTY_NOT_AVAILABLE');
    }
    if (!(await this.people.findPerson(input.buyerId))) throw new NotFoundError('Comprador');
    if (input.buyerId === property.ownerId) {
      throw new BusinessRuleError('O comprador não pode ser o próprio proprietário do imóvel.', 'BUYER_IS_OWNER');
    }
    if (!(await this.users.findActiveUser(input.brokerId))) throw new NotFoundError('Corretor');

    const proposal = Proposal.create(
      {
        propertyId: input.propertyId,
        buyerId: input.buyerId,
        brokerId: input.brokerId,
        amount: Money.fromCents(input.amountCents),
        paymentTerms: input.paymentTerms,
        validUntil: input.validUntil,
      },
      this.clock.today(),
    );
    await this.proposals.save(proposal);
    return toProposalOutput(proposal);
  }
}

export type DecideProposalInput = { id: string } & (
  | { decision: 'ACCEPT' }
  | { decision: 'REJECT'; reason: string }
  | { decision: 'CANCEL' }
);

/**
 * Resposta à proposta. Aceitar reserva o imóvel; cancelar uma proposta
 * já aceita devolve o imóvel ao mercado. As duas mudanças são gravadas juntas.
 */
export class DecideProposal implements UseCase<DecideProposalInput, ProposalOutput> {
  constructor(
    private readonly proposals: ProposalRepository,
    private readonly properties: PropertyRegistry,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(input: DecideProposalInput): Promise<ProposalOutput> {
    const proposal = await this.proposals.findById(input.id);
    if (!proposal) throw new NotFoundError('Proposta');
    const now = this.clock.now();

    await this.uow.run(async () => {
      switch (input.decision) {
        case 'ACCEPT':
          proposal.accept(now, this.clock.today());
          await this.properties.reserve(proposal.propertyId);
          break;
        case 'REJECT':
          proposal.reject(input.reason, now);
          break;
        case 'CANCEL': {
          const property = await this.properties.findProperty(proposal.propertyId);
          if (proposal.status === 'ACCEPTED' && property?.status === 'SOLD') {
            throw new BusinessRuleError('Esta proposta já virou uma venda e não pode ser cancelada.', 'PROPOSAL_ALREADY_SOLD');
          }
          const { wasAccepted } = proposal.cancel(now);
          if (wasAccepted) await this.properties.release(proposal.propertyId);
          break;
        }
      }
      await this.proposals.save(proposal);
    });
    return toProposalOutput(proposal);
  }
}

export class GetProposal implements UseCase<{ id: string }, ProposalOutput> {
  constructor(private readonly proposals: ProposalRepository) {}

  async execute({ id }: { id: string }): Promise<ProposalOutput> {
    const proposal = await this.proposals.findById(id);
    if (!proposal) throw new NotFoundError('Proposta');
    return toProposalOutput(proposal);
  }
}

export class SearchProposals implements UseCase<ProposalFilters, Page<ProposalOutput>> {
  constructor(private readonly proposals: ProposalRepository) {}

  async execute(filters: ProposalFilters): Promise<Page<ProposalOutput>> {
    return mapPage(await this.proposals.search(filters), toProposalOutput);
  }
}
