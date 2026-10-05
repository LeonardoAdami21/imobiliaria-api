import { Module } from '@nestjs/common';
import { IdentityModule } from '@/modules/identity/identity.module';
import { USER_DIRECTORY } from '@/modules/identity/identity.tokens';
import { PropertiesModule } from '@/modules/properties/properties.module';
import { PROPERTY_REGISTRY } from '@/modules/properties/properties.tokens';
import { PrismaContext } from '@/shared/infra/database/prisma';
import { provide } from '@/shared/infra/nest/provide';
import { CLOCK, UNIT_OF_WORK } from '@/shared/tokens';
import {
  AssignLead,
  ChangeLeadStatus,
  CreateLead,
  GetLead,
  SearchLeads,
  UpdateLead,
} from './application/lead-use-cases';
import { FinishVisit, RescheduleVisit, ScheduleVisit, SearchVisits } from './application/visit-use-cases';
import { LEAD_REPOSITORY, PERSON_DIRECTORY, VISIT_REPOSITORY } from './crm.tokens';
import { LeadsController } from './infra/leads.controller';
import { PrismaLeadRepository, PrismaVisitRepository } from './infra/prisma-repositories';
import { VisitsController } from './infra/visits.controller';
import { PeopleModule } from './people.module';

/** Funil de vendas: leads e agenda de visitas. */
@Module({
  imports: [IdentityModule, PeopleModule, PropertiesModule],
  controllers: [LeadsController, VisitsController],
  providers: [
    provide(PrismaLeadRepository, [PrismaContext], LEAD_REPOSITORY),
    provide(PrismaVisitRepository, [PrismaContext], VISIT_REPOSITORY),

    provide(CreateLead, [LEAD_REPOSITORY, USER_DIRECTORY, PROPERTY_REGISTRY]),
    provide(UpdateLead, [LEAD_REPOSITORY, PROPERTY_REGISTRY]),
    provide(AssignLead, [LEAD_REPOSITORY, USER_DIRECTORY]),
    provide(ChangeLeadStatus, [LEAD_REPOSITORY, PERSON_DIRECTORY]),
    provide(GetLead, [LEAD_REPOSITORY]),
    provide(SearchLeads, [LEAD_REPOSITORY]),

    provide(ScheduleVisit, [VISIT_REPOSITORY, LEAD_REPOSITORY, USER_DIRECTORY, PROPERTY_REGISTRY, UNIT_OF_WORK, CLOCK]),
    provide(RescheduleVisit, [VISIT_REPOSITORY, CLOCK]),
    provide(FinishVisit, [VISIT_REPOSITORY, CLOCK]),
    provide(SearchVisits, [VISIT_REPOSITORY]),
  ],
})
export class CrmModule {}
