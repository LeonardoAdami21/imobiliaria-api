import { Module } from '@nestjs/common';
import { PeopleModule } from '@/modules/crm/people.module';
import { PERSON_DIRECTORY } from '@/modules/crm/crm.tokens';
import { IdentityModule } from '@/modules/identity/identity.module';
import { USER_DIRECTORY } from '@/modules/identity/identity.tokens';
import { PrismaContext } from '@/shared/infra/database/prisma';
import { provide } from '@/shared/infra/nest/provide';
import {
  GetProperty,
  ManagePropertyPhotos,
  PropertyRegistryService,
  RegisterProperty,
  SearchProperties,
  SetPropertyListing,
  UpdateProperty,
} from './application/property-use-cases';
import { PrismaPropertyRepository } from './infra/prisma-property-repository';
import { PropertiesController } from './infra/properties.controller';
import { PROPERTY_REGISTRY, PROPERTY_REPOSITORY } from './properties.tokens';

/** Cadastro e anúncio de imóveis. Exporta o PROPERTY_REGISTRY, por onde os outros módulos mudam a situação do imóvel. */
@Module({
  imports: [IdentityModule, PeopleModule],
  controllers: [PropertiesController],
  providers: [
    provide(PrismaPropertyRepository, [PrismaContext], PROPERTY_REPOSITORY),
    provide(PropertyRegistryService, [PROPERTY_REPOSITORY], PROPERTY_REGISTRY),
    provide(RegisterProperty, [PROPERTY_REPOSITORY, PERSON_DIRECTORY, USER_DIRECTORY]),
    provide(UpdateProperty, [PROPERTY_REPOSITORY, USER_DIRECTORY]),
    provide(GetProperty, [PROPERTY_REPOSITORY]),
    provide(SearchProperties, [PROPERTY_REPOSITORY]),
    provide(ManagePropertyPhotos, [PROPERTY_REPOSITORY]),
    provide(SetPropertyListing, [PROPERTY_REPOSITORY]),
  ],
  exports: [PROPERTY_REGISTRY],
})
export class PropertiesModule {}
