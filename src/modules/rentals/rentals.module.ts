import { Module } from '@nestjs/common';
import { PERSON_DIRECTORY } from '@/modules/crm/crm.tokens';
import { PeopleModule } from '@/modules/crm/people.module';
import { PropertiesModule } from '@/modules/properties/properties.module';
import { PROPERTY_REGISTRY } from '@/modules/properties/properties.tokens';
import { PrismaContext } from '@/shared/infra/database/prisma';
import { provide } from '@/shared/infra/nest/provide';
import { CLOCK, UNIT_OF_WORK } from '@/shared/tokens';
import { PayCharge, QuoteCharge, RegisterOwnerTransfer, SearchCharges } from './application/charge-use-cases';
import { AdjustRent, CloseLease, CreateLease, GetLease, SearchLeases } from './application/lease-use-cases';
import { ChargesController } from './infra/charges.controller';
import { LeasesController } from './infra/leases.controller';
import { PrismaLeaseRepository, PrismaRentChargeRepository } from './infra/prisma-repositories';
import { LEASE_REPOSITORY, RENT_CHARGE_REPOSITORY } from './rentals.tokens';

/** Contratos de locação, cobranças mensais e repasses ao proprietário. */
@Module({
  imports: [PeopleModule, PropertiesModule],
  controllers: [LeasesController, ChargesController],
  providers: [
    provide(PrismaLeaseRepository, [PrismaContext], LEASE_REPOSITORY),
    provide(PrismaRentChargeRepository, [PrismaContext], RENT_CHARGE_REPOSITORY),

    provide(CreateLease, [LEASE_REPOSITORY, RENT_CHARGE_REPOSITORY, PROPERTY_REGISTRY, PERSON_DIRECTORY, UNIT_OF_WORK]),
    provide(AdjustRent, [LEASE_REPOSITORY, RENT_CHARGE_REPOSITORY, UNIT_OF_WORK, CLOCK]),
    provide(CloseLease, [LEASE_REPOSITORY, RENT_CHARGE_REPOSITORY, PROPERTY_REGISTRY, UNIT_OF_WORK, CLOCK]),
    provide(GetLease, [LEASE_REPOSITORY]),
    provide(SearchLeases, [LEASE_REPOSITORY]),

    provide(SearchCharges, [RENT_CHARGE_REPOSITORY, CLOCK]),
    provide(QuoteCharge, [RENT_CHARGE_REPOSITORY, LEASE_REPOSITORY, CLOCK]),
    provide(PayCharge, [RENT_CHARGE_REPOSITORY, LEASE_REPOSITORY, CLOCK]),
    provide(RegisterOwnerTransfer, [RENT_CHARGE_REPOSITORY, CLOCK]),
  ],
})
export class RentalsModule {}
