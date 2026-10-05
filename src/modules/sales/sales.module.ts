import { Module } from '@nestjs/common';
import { PERSON_DIRECTORY } from '@/modules/crm/crm.tokens';
import { PeopleModule } from '@/modules/crm/people.module';
import { IdentityModule } from '@/modules/identity/identity.module';
import { USER_DIRECTORY } from '@/modules/identity/identity.tokens';
import { PropertiesModule } from '@/modules/properties/properties.module';
import { PROPERTY_REGISTRY } from '@/modules/properties/properties.tokens';
import { PrismaContext } from '@/shared/infra/database/prisma';
import { provide } from '@/shared/infra/nest/provide';
import { CLOCK, UNIT_OF_WORK } from '@/shared/tokens';
import { CreateProposal, DecideProposal, GetProposal, SearchProposals } from './application/proposal-use-cases';
import { CloseSale, GetSale, ListCommissions, PayCommission, SearchSales } from './application/sale-use-cases';
import { PrismaProposalRepository, PrismaSaleRepository } from './infra/prisma-repositories';
import { ProposalsController } from './infra/proposals.controller';
import { CommissionsController, SalesController } from './infra/sales.controller';
import { PROPOSAL_REPOSITORY, SALE_REPOSITORY } from './sales.tokens';

/** Propostas de compra, fechamento de vendas e comissões. */
@Module({
  imports: [IdentityModule, PeopleModule, PropertiesModule],
  controllers: [ProposalsController, SalesController, CommissionsController],
  providers: [
    provide(PrismaProposalRepository, [PrismaContext], PROPOSAL_REPOSITORY),
    provide(PrismaSaleRepository, [PrismaContext], SALE_REPOSITORY),

    provide(CreateProposal, [PROPOSAL_REPOSITORY, PROPERTY_REGISTRY, PERSON_DIRECTORY, USER_DIRECTORY, CLOCK]),
    provide(DecideProposal, [PROPOSAL_REPOSITORY, PROPERTY_REGISTRY, UNIT_OF_WORK, CLOCK]),
    provide(GetProposal, [PROPOSAL_REPOSITORY]),
    provide(SearchProposals, [PROPOSAL_REPOSITORY]),

    provide(CloseSale, [SALE_REPOSITORY, PROPOSAL_REPOSITORY, PROPERTY_REGISTRY, UNIT_OF_WORK, CLOCK]),
    provide(PayCommission, [SALE_REPOSITORY, CLOCK]),
    provide(GetSale, [SALE_REPOSITORY]),
    provide(SearchSales, [SALE_REPOSITORY]),
    provide(ListCommissions, [SALE_REPOSITORY]),
  ],
})
export class SalesModule {}
