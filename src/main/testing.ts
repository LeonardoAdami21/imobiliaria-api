import { InMemoryLeadRepository, InMemoryPersonRepository, InMemoryVisitRepository } from '@/modules/crm/infra/in-memory-repositories';
import { FakeHasher, FakeTokenService, InMemoryUserRepository } from '@/modules/identity/infra/in-memory-user-repository';
import { InMemoryPropertyRepository } from '@/modules/properties/infra/in-memory-property-repository';
import { InMemoryLeaseRepository, InMemoryRentChargeRepository } from '@/modules/rentals/infra/in-memory-repositories';
import { InMemoryProposalRepository, InMemorySaleRepository } from '@/modules/sales/infra/in-memory-repositories';
import { FixedClock, ImmediateUnitOfWork } from '@/shared/testing/in-memory-repository';
import { buildContainer } from './container';

/**
 * A aplicação inteira rodando em memória: os mesmos casos de uso de produção,
 * ligados a repositórios falsos. É o que os testes unitários usam, sem banco e sem HTTP.
 */
export function buildInMemoryApp(now = '2026-03-10T12:00:00Z') {
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
  const container = buildContainer({
    ...repos,
    uow: new ImmediateUnitOfWork(),
    clock,
    hasher: new FakeHasher(),
    tokens: new FakeTokenService(),
  });
  return { ...container.useCases, repos, clock, container };
}

export type InMemoryApp = ReturnType<typeof buildInMemoryApp>;

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
