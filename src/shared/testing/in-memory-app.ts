import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '@/app.module';
import { ENV, type Env } from '@/config/env';
import { PrismaClient } from '@/generated/prisma/client';
import {
  AssignLead,
  ChangeLeadStatus,
  CreateLead,
  GetLead,
  SearchLeads,
  UpdateLead,
} from '@/modules/crm/application/lead-use-cases';
import { GetPerson, RegisterPerson, SearchPeople, UpdatePerson } from '@/modules/crm/application/person-use-cases';
import { FinishVisit, RescheduleVisit, ScheduleVisit, SearchVisits } from '@/modules/crm/application/visit-use-cases';
import { LEAD_REPOSITORY, PERSON_REPOSITORY, VISIT_REPOSITORY } from '@/modules/crm/crm.tokens';
import { InMemoryLeadRepository, InMemoryPersonRepository, InMemoryVisitRepository } from '@/modules/crm/infra/in-memory-repositories';
import {
  Authenticate,
  ChangeOwnPassword,
  EnsureAdminUser,
  GetUser,
  ListUsers,
  RegisterUser,
  UpdateUser,
  VerifyAccessToken,
} from '@/modules/identity/application/user-use-cases';
import { PASSWORD_HASHER, TOKEN_SERVICE, USER_REPOSITORY } from '@/modules/identity/identity.tokens';
import { FakeHasher, FakeTokenService, InMemoryUserRepository } from '@/modules/identity/infra/in-memory-user-repository';
import {
  GetProperty,
  ManagePropertyPhotos,
  RegisterProperty,
  SearchProperties,
  SetPropertyListing,
  UpdateProperty,
} from '@/modules/properties/application/property-use-cases';
import { InMemoryPropertyRepository } from '@/modules/properties/infra/in-memory-property-repository';
import { PROPERTY_REPOSITORY } from '@/modules/properties/properties.tokens';
import { PayCharge, QuoteCharge, RegisterOwnerTransfer, SearchCharges } from '@/modules/rentals/application/charge-use-cases';
import { AdjustRent, CloseLease, CreateLease, GetLease, SearchLeases } from '@/modules/rentals/application/lease-use-cases';
import { InMemoryLeaseRepository, InMemoryRentChargeRepository } from '@/modules/rentals/infra/in-memory-repositories';
import { LEASE_REPOSITORY, RENT_CHARGE_REPOSITORY } from '@/modules/rentals/rentals.tokens';
import { CreateProposal, DecideProposal, GetProposal, SearchProposals } from '@/modules/sales/application/proposal-use-cases';
import { CloseSale, GetSale, ListCommissions, PayCommission, SearchSales } from '@/modules/sales/application/sale-use-cases';
import { InMemoryProposalRepository, InMemorySaleRepository } from '@/modules/sales/infra/in-memory-repositories';
import { PROPOSAL_REPOSITORY, SALE_REPOSITORY } from '@/modules/sales/sales.tokens';
import { CLOCK, UNIT_OF_WORK } from '@/shared/tokens';
import { FixedClock, ImmediateUnitOfWork } from './in-memory-repository';

export const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  AGENCY_NAME: 'Imobiliária de Teste',
  CORS_ORIGIN: '*',
  BUSINESS_TIMEZONE: 'America/Sao_Paulo',
  DATABASE_URL: 'postgresql://ninguem:nada@localhost:1/sem-banco',
  JWT_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres',
  JWT_EXPIRES_IN: '1h',
  ADMIN_NAME: 'Admin de Teste',
};

/**
 * Monta o AppModule de verdade (mesmos módulos, casos de uso e rotas de produção),
 * trocando banco, criptografia e relógio por versões em memória. É o que os
 * testes unitários usam, sem PostgreSQL.
 */
export async function buildInMemoryModule(now = '2026-03-10T12:00:00Z') {
  const repos = {
    users: new InMemoryUserRepository(),
    people: new InMemoryPersonRepository(),
    leads: new InMemoryLeadRepository(),
    visits: new InMemoryVisitRepository(),
    properties: new InMemoryPropertyRepository(),
    leases: new InMemoryLeaseRepository(),
    charges: new InMemoryRentChargeRepository(),
    proposals: new InMemoryProposalRepository(),
    sales: new InMemorySaleRepository(),
  };
  const clock = new FixedClock(now);

  const overrides: [symbol | Function, unknown][] = [
    [ENV, TEST_ENV],
    [PrismaClient, { $disconnect: async () => {} }],
    [UNIT_OF_WORK, new ImmediateUnitOfWork()],
    [CLOCK, clock],
    [PASSWORD_HASHER, new FakeHasher()],
    [TOKEN_SERVICE, new FakeTokenService()],
    [USER_REPOSITORY, repos.users],
    [PERSON_REPOSITORY, repos.people],
    [LEAD_REPOSITORY, repos.leads],
    [VISIT_REPOSITORY, repos.visits],
    [PROPERTY_REPOSITORY, repos.properties],
    [LEASE_REPOSITORY, repos.leases],
    [RENT_CHARGE_REPOSITORY, repos.charges],
    [PROPOSAL_REPOSITORY, repos.proposals],
    [SALE_REPOSITORY, repos.sales],
  ];
  let builder = Test.createTestingModule({ imports: [AppModule] });
  for (const [token, value] of overrides) builder = builder.overrideProvider(token).useValue(value);
  const moduleRef = await builder.compile();

  return { moduleRef, repos, clock };
}

/** A aplicação em memória com os casos de uso agrupados por módulo, como os testes os chamam. */
export async function buildInMemoryApp(now = '2026-03-10T12:00:00Z') {
  const { moduleRef, repos, clock } = await buildInMemoryModule(now);
  return { moduleRef, repos, clock, ...buildUseCaseGroups(moduleRef) };
}

export type InMemoryApp = Awaited<ReturnType<typeof buildInMemoryApp>>;

/** Busca no container do Nest os casos de uso de cada módulo (usado pelos testes e pelo seed). */
export function buildUseCaseGroups(container: Pick<TestingModule, 'get'>) {
  const get = <T>(useCase: new (...args: never[]) => T): T => container.get(useCase);

  return {
    identity: {
      authenticate: get(Authenticate),
      changeOwnPassword: get(ChangeOwnPassword),
      registerUser: get(RegisterUser),
      getUser: get(GetUser),
      listUsers: get(ListUsers),
      updateUser: get(UpdateUser),
      ensureAdminUser: get(EnsureAdminUser),
      verifyAccessToken: get(VerifyAccessToken),
    },
    crm: {
      registerPerson: get(RegisterPerson),
      updatePerson: get(UpdatePerson),
      getPerson: get(GetPerson),
      searchPeople: get(SearchPeople),
      createLead: get(CreateLead),
      updateLead: get(UpdateLead),
      assignLead: get(AssignLead),
      changeLeadStatus: get(ChangeLeadStatus),
      getLead: get(GetLead),
      searchLeads: get(SearchLeads),
      scheduleVisit: get(ScheduleVisit),
      rescheduleVisit: get(RescheduleVisit),
      finishVisit: get(FinishVisit),
      searchVisits: get(SearchVisits),
    },
    properties: {
      registerProperty: get(RegisterProperty),
      updateProperty: get(UpdateProperty),
      getProperty: get(GetProperty),
      searchProperties: get(SearchProperties),
      managePropertyPhotos: get(ManagePropertyPhotos),
      setPropertyListing: get(SetPropertyListing),
    },
    rentals: {
      createLease: get(CreateLease),
      adjustRent: get(AdjustRent),
      closeLease: get(CloseLease),
      getLease: get(GetLease),
      searchLeases: get(SearchLeases),
      searchCharges: get(SearchCharges),
      quoteCharge: get(QuoteCharge),
      payCharge: get(PayCharge),
      registerOwnerTransfer: get(RegisterOwnerTransfer),
    },
    sales: {
      createProposal: get(CreateProposal),
      decideProposal: get(DecideProposal),
      getProposal: get(GetProposal),
      searchProposals: get(SearchProposals),
      closeSale: get(CloseSale),
      payCommission: get(PayCommission),
      getSale: get(GetSale),
      searchSales: get(SearchSales),
      listCommissions: get(ListCommissions),
    },
  };
}

/** Gera um CPF válido e diferente para cada número informado. */
export function cpf(seed: number): string {
  const base = String(100_000_000 + seed).slice(0, 9);
  const digit = (digits: string): number => {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) sum += Number(digits[i]) * (digits.length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const first = digit(base);
  return `${base}${first}${digit(base + first)}`;
}

/** Cenário mínimo que quase todo teste de negócio precisa: corretor, proprietário, cliente e um imóvel. */
export async function seedBasics(app: InMemoryApp) {
  const broker = await app.identity.registerUser.execute({
    name: 'Carla Corretora',
    email: 'carla@imob.com.br',
    password: 'senha-forte-1',
    role: 'BROKER',
    creci: '12345-F',
  });
  const owner = await app.crm.registerPerson.execute({ name: 'Otávio Proprietário', document: cpf(1) });
  const client = await app.crm.registerPerson.execute({ name: 'Clara Cliente', document: cpf(2) });
  const property = await app.properties.registerProperty.execute({
    ownerId: owner.id,
    listingBrokerId: broker.id,
    title: 'Apartamento 2 quartos no Centro',
    type: 'APARTMENT',
    purpose: 'BOTH',
    salePriceCents: 450_000_00,
    rentPriceCents: 2_000_00,
    bedrooms: 2,
    address: { street: 'Rua das Flores', number: '100', district: 'Centro', city: 'Curitiba', state: 'PR', zipCode: '80010-000' },
  });
  return { broker, owner, client, property };
}
