import { Module } from '@nestjs/common';
import { PrismaContext } from '@/shared/infra/database/prisma';
import { provide } from '@/shared/infra/nest/provide';
import {
  GetPerson,
  PersonDirectoryService,
  RegisterPerson,
  SearchPeople,
  UpdatePerson,
} from './application/person-use-cases';
import { PERSON_DIRECTORY, PERSON_REPOSITORY } from './crm.tokens';
import { PeopleController } from './infra/people.controller';
import { PrismaPersonRepository } from './infra/prisma-repositories';

/**
 * Cadastro de pessoas do CRM (proprietários, inquilinos, compradores, fiadores).
 * Fica separado de leads e visitas porque imóveis, locação e vendas dependem dele,
 * enquanto leads dependem de imóveis: juntos, formariam um ciclo entre módulos.
 */
@Module({
  controllers: [PeopleController],
  providers: [
    provide(PrismaPersonRepository, [PrismaContext], PERSON_REPOSITORY),
    provide(PersonDirectoryService, [PERSON_REPOSITORY], PERSON_DIRECTORY),
    provide(RegisterPerson, [PERSON_REPOSITORY]),
    provide(UpdatePerson, [PERSON_REPOSITORY]),
    provide(GetPerson, [PERSON_REPOSITORY]),
    provide(SearchPeople, [PERSON_REPOSITORY]),
  ],
  exports: [PERSON_DIRECTORY],
})
export class PeopleModule {}
