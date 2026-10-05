import type { Clock, UnitOfWork } from '@/shared/application/contracts';
import { publicRoute, type AuthUser, type Route } from '@/shared/infra/http/route';

import {
  AssignLead,
  ChangeLeadStatus,
  CreateLead,
  GetLead,
  SearchLeads,
  UpdateLead,
} from '@/modules/crm/application/lead-use-cases';
import {
  GetPerson,
  PersonDirectoryService,
  RegisterPerson,
  SearchPeople,
  UpdatePerson,
} from '@/modules/crm/application/person-use-cases';
import { FinishVisit, RescheduleVisit, ScheduleVisit, SearchVisits } from '@/modules/crm/application/visit-use-cases';
import type { LeadRepository, PersonRepository, VisitRepository } from '@/modules/crm/domain/repositories';
import { crmRoutes } from '@/modules/crm/infra/routes';

import type { PasswordHasher, TokenService } from '@/modules/identity/application/ports';
import {
  Authenticate,
  ChangeOwnPassword,
  EnsureAdminUser,
  GetUser,
  ListUsers,
  RegisterUser,
  UpdateUser,
  UserDirectoryService,
} from '@/modules/identity/application/user-use-cases';
import type { UserRepository } from '@/modules/identity/domain/user-repository';
import { identityRoutes } from '@/modules/identity/infra/routes';

import {
  GetProperty,
  ManagePropertyPhotos,
  PropertyRegistryService,
  RegisterProperty,
  SearchProperties,
  SetPropertyListing,
  UpdateProperty,
} from '@/modules/properties/application/property-use-cases';
import type { PropertyRepository } from '@/modules/properties/domain/property-repository';
import { propertiesRoutes } from '@/modules/properties/infra/routes';

import { PayCharge, QuoteCharge, RegisterOwnerTransfer, SearchCharges } from '@/modules/rentals/application/charge-use-cases';
import { AdjustRent, CloseLease, CreateLease, GetLease, SearchLeases } from '@/modules/rentals/application/lease-use-cases';
import type { LeaseRepository, RentChargeRepository } from '@/modules/rentals/domain/repositories';
import { rentalsRoutes } from '@/modules/rentals/infra/routes';

import { CreateProposal, DecideProposal, GetProposal, SearchProposals } from '@/modules/sales/application/proposal-use-cases';
import { CloseSale, GetSale, ListCommissions, PayCommission, SearchSales } from '@/modules/sales/application/sale-use-cases';
import type { ProposalRepository, SaleRepository } from '@/modules/sales/domain/repositories';
import { salesRoutes } from '@/modules/sales/infra/routes';

/** Tudo o que vem de fora da aplicação: banco, criptografia, relógio. */
export interface Dependencies {
  users: UserRepository;
  people: PersonRepository;
  leads: LeadRepository;
  visits: VisitRepository;
  properties: PropertyRepository;
  leases: LeaseRepository;
  charges: RentChargeRepository;
  proposals: ProposalRepository;
  sales: SaleRepository;
  uow: UnitOfWork;
  clock: Clock;
  hasher: PasswordHasher;
  tokens: TokenService;
}

/**
 * Raiz de composição: o único lugar que conhece todas as classes concretas
 * e liga cada caso de uso às suas dependências. Trocar o banco, o hash de senha
 * ou o relógio é trocar o que se passa aqui; nenhum caso de uso muda.
 */
export function buildContainer(deps: Dependencies) {
  const { uow, clock } = deps;

  // Contratos públicos de cada módulo, usados pelos demais.
  const userDirectory = new UserDirectoryService(deps.users);
  const personDirectory = new PersonDirectoryService(deps.people);
  const propertyRegistry = new PropertyRegistryService(deps.properties);

  const identity = {
    authenticate: new Authenticate(deps.users, deps.hasher, deps.tokens),
    changeOwnPassword: new ChangeOwnPassword(deps.users, deps.hasher),
    registerUser: new RegisterUser(deps.users, deps.hasher),
    getUser: new GetUser(deps.users),
    listUsers: new ListUsers(deps.users),
    updateUser: new UpdateUser(deps.users),
    ensureAdminUser: new EnsureAdminUser(deps.users, deps.hasher),
  };

  const crm = {
    registerPerson: new RegisterPerson(deps.people),
    updatePerson: new UpdatePerson(deps.people),
    getPerson: new GetPerson(deps.people),
    searchPeople: new SearchPeople(deps.people),
    createLead: new CreateLead(deps.leads, userDirectory, propertyRegistry),
    updateLead: new UpdateLead(deps.leads, propertyRegistry),
    assignLead: new AssignLead(deps.leads, userDirectory),
    changeLeadStatus: new ChangeLeadStatus(deps.leads, personDirectory),
    getLead: new GetLead(deps.leads),
    searchLeads: new SearchLeads(deps.leads),
    scheduleVisit: new ScheduleVisit(deps.visits, deps.leads, userDirectory, propertyRegistry, uow, clock),
    rescheduleVisit: new RescheduleVisit(deps.visits, clock),
    finishVisit: new FinishVisit(deps.visits, clock),
    searchVisits: new SearchVisits(deps.visits),
  };

  const properties = {
    registerProperty: new RegisterProperty(deps.properties, personDirectory, userDirectory),
    updateProperty: new UpdateProperty(deps.properties, userDirectory),
    getProperty: new GetProperty(deps.properties),
    searchProperties: new SearchProperties(deps.properties),
    managePropertyPhotos: new ManagePropertyPhotos(deps.properties),
    setPropertyListing: new SetPropertyListing(deps.properties),
  };

  const rentals = {
    createLease: new CreateLease(deps.leases, deps.charges, propertyRegistry, personDirectory, uow),
    adjustRent: new AdjustRent(deps.leases, deps.charges, uow, clock),
    closeLease: new CloseLease(deps.leases, deps.charges, propertyRegistry, uow, clock),
    getLease: new GetLease(deps.leases),
    searchLeases: new SearchLeases(deps.leases),
    searchCharges: new SearchCharges(deps.charges, clock),
    quoteCharge: new QuoteCharge(deps.charges, deps.leases, clock),
    payCharge: new PayCharge(deps.charges, deps.leases, clock),
    registerOwnerTransfer: new RegisterOwnerTransfer(deps.charges, clock),
  };

  const sales = {
    createProposal: new CreateProposal(deps.proposals, propertyRegistry, personDirectory, userDirectory, clock),
    decideProposal: new DecideProposal(deps.proposals, propertyRegistry, uow, clock),
    getProposal: new GetProposal(deps.proposals),
    searchProposals: new SearchProposals(deps.proposals),
    closeSale: new CloseSale(deps.sales, deps.proposals, propertyRegistry, uow, clock),
    payCommission: new PayCommission(deps.sales, clock),
    getSale: new GetSale(deps.sales),
    searchSales: new SearchSales(deps.sales),
    listCommissions: new ListCommissions(deps.sales),
  };

  const health = publicRoute({
    method: 'get',
    path: '/health',
    tag: 'Sistema',
    summary: 'Verifica se a API está no ar',
    handler: async () => ({ status: 'ok', time: clock.now() }),
  });

  const routes: Route[] = [
    health,
    ...identityRoutes(identity),
    ...crmRoutes(crm),
    ...propertiesRoutes(properties),
    ...rentalsRoutes(rentals),
    ...salesRoutes(sales),
  ];

  /** Um token só vale enquanto o usuário existir e estiver ativo; o papel vem sempre do banco. */
  async function authenticate(token: string): Promise<AuthUser | null> {
    const payload = await deps.tokens.verify(token);
    if (!payload) return null;
    const user = await userDirectory.findActiveUser(payload.userId);
    return user && { id: user.id, role: user.role };
  }

  return { useCases: { identity, crm, properties, rentals, sales }, routes, authenticate };
}

export type Container = ReturnType<typeof buildContainer>;
