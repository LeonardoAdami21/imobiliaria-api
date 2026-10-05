import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { EnvModule } from './config/env.module';
import { CrmModule } from './modules/crm/crm.module';
import { PeopleModule } from './modules/crm/people.module';
import { IdentityModule } from './modules/identity/identity.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { RentalsModule } from './modules/rentals/rentals.module';
import { SalesModule } from './modules/sales/sales.module';
import { AppController } from './app.controller';
import { CoreModule } from './shared/core.module';
import { AppExceptionFilter } from './shared/infra/http/exception.filter';

/**
 * Módulo raiz. Cada módulo de negócio liga seus casos de uso às implementações
 * (Prisma, JWT, relógio) por tokens de injeção; nenhum caso de uso conhece o NestJS.
 */
@Module({
  imports: [EnvModule, CoreModule, IdentityModule, PeopleModule, PropertiesModule, CrmModule, RentalsModule, SalesModule],
  controllers: [AppController],
  providers: [
    // Valida @Body(), @Query() e @Param() tipados com DTOs criados por createZodDto().
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AppExceptionFilter },
  ],
})
export class AppModule {}
