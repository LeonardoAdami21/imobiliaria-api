/**
 * Dados de demonstração para desenvolvimento do front-end.
 * Rode com: npm run db:seed
 *
 * Tudo é criado pelos mesmos casos de uso da API, então os dados
 * respeitam as regras de negócio (cobranças geradas, imóvel alugado etc.).
 */
import 'dotenv/config';
import { createApplication } from '../src/main/app';
import { loadEnv } from '../src/main/env';
import { cpf } from '../src/main/testing';
import { addMonths, startOfMonth } from '../src/shared/domain/dates';
import { createPrismaClient } from '../src/shared/infra/database/prisma';
import { SystemClock } from '../src/shared/infra/system-clock';

const PASSWORD = 'demo12345';

async function main(): Promise<void> {
  const env = loadEnv();
  const prisma = createPrismaClient(env.DATABASE_URL);
  const { identity, crm, properties, rentals, sales } = createApplication(env, prisma).container.useCases;
  const today = new SystemClock(env.BUSINESS_TIMEZONE).today();

  try {
    if ((await prisma.person.count()) > 0) {
      console.log('O banco já tem dados. Seed ignorado.');
      return;
    }

    await identity.ensureAdminUser.execute({ name: 'Administrador', email: 'admin@demo.com.br', password: PASSWORD });
    const user = (name: string, email: string, role: 'MANAGER' | 'BROKER' | 'FINANCE', creci?: string) =>
      identity.registerUser.execute({ name, email, password: PASSWORD, role, creci });
    await user('Gisele Gerente', 'gerente@demo.com.br', 'MANAGER');
    await user('Fernando Financeiro', 'financeiro@demo.com.br', 'FINANCE');
    const carla = await user('Carla Corretora', 'carla@demo.com.br', 'BROKER', 'CRECI-PR 12345-F');
    const caio = await user('Caio Corretor', 'caio@demo.com.br', 'BROKER', 'CRECI-PR 67890-F');

    const person = (name: string, seed: number, phone: string) =>
      crm.registerPerson.execute({ name, document: cpf(seed), phone, email: `${name.split(' ')[0]!.toLowerCase()}@exemplo.com` });
    const otavio = await person('Otavio Proprietario', 1, '(41) 99911-0001');
    const paula = await person('Paula Proprietaria', 2, '(41) 99911-0002');
    const ivo = await person('Ivo Inquilino', 3, '(41) 99911-0003');
    const bruno = await person('Bruno Comprador', 4, '(41) 99911-0004');
    await crm.registerPerson.execute({ name: 'Construtora Alfa Ltda', document: '11.222.333/0001-81', phone: '(41) 3333-0000' });

    const address = (street: string, number: string, district: string, zipCode: string) => ({
      street,
      number,
      district,
      city: 'Curitiba',
      state: 'PR',
      zipCode,
    });
    const apartment = await properties.registerProperty.execute({
      ownerId: otavio.id,
      listingBrokerId: carla.id,
      title: 'Apartamento 2 quartos no Centro',
      description: 'Andar alto, sol da manhã, a duas quadras do metrô.',
      type: 'APARTMENT',
      purpose: 'RENT',
      rentPriceCents: 2_000_00,
      condoFeeCents: 450_00,
      propertyTaxCents: 900_00,
      bedrooms: 2,
      bathrooms: 1,
      parkingSpaces: 1,
      areaM2: 68.5,
      address: address('Rua das Flores', '100', 'Centro', '80010000'),
    });
    const house = await properties.registerProperty.execute({
      ownerId: paula.id,
      listingBrokerId: caio.id,
      title: 'Casa com quintal no Batel',
      type: 'HOUSE',
      purpose: 'SALE',
      salePriceCents: 800_000_00,
      bedrooms: 3,
      bathrooms: 2,
      parkingSpaces: 2,
      areaM2: 180,
      address: address('Rua do Sol', '55', 'Batel', '80420000'),
    });
    await properties.registerProperty.execute({
      ownerId: paula.id,
      title: 'Sala comercial no Água Verde',
      type: 'COMMERCIAL',
      purpose: 'BOTH',
      salePriceCents: 320_000_00,
      rentPriceCents: 1_800_00,
      bathrooms: 1,
      areaM2: 42,
      address: address('Avenida República Argentina', '1200', 'Água Verde', '80620010'),
    });
    await properties.managePropertyPhotos.execute({
      id: house.id,
      action: 'add',
      url: 'https://picsum.photos/seed/casa-batel/1200/800',
      caption: 'Fachada',
    });

    // Locação em andamento: começou há 3 meses, com o primeiro aluguel pago e repassado.
    const lease = await rentals.createLease.execute({
      propertyId: apartment.id,
      tenantId: ivo.id,
      startDate: startOfMonth(addMonths(today, -3)),
      durationMonths: 30,
      rentAmountCents: 2_000_00,
      dueDay: 10,
      adminFeePercent: 10,
      lateFeePercent: 10,
      monthlyInterestPercent: 1,
      guaranteeType: 'DEPOSIT',
      depositAmountCents: 6_000_00,
      adjustmentIndex: 'IPCA',
    });
    const charges = await rentals.searchCharges.execute({ leaseId: lease.id, page: 1, perPage: 3 });
    const first = charges.items[0]!;
    await rentals.payCharge.execute({ id: first.id, paidAt: new Date(`${first.dueDate}T00:00:00Z`) });
    await rentals.registerOwnerTransfer.execute({ id: first.id });

    // Venda em negociação: proposta aguardando resposta do proprietário.
    await sales.createProposal.execute({
      propertyId: house.id,
      buyerId: bruno.id,
      brokerId: carla.id,
      amountCents: 770_000_00,
      paymentTerms: '30% de entrada e o restante financiado.',
    });

    // Funil do CRM.
    const system = { id: 'seed', role: 'ADMIN' };
    await crm.createLead.execute({ name: 'Lia Lead', phone: '(41) 98888-0001', interest: 'BUY', source: 'PORTAL', propertyId: house.id, actor: system });
    await crm.createLead.execute({
      actor: system,
      name: 'Leo Lead',
      email: 'leo@exemplo.com',
      interest: 'RENT',
      source: 'WEBSITE',
      brokerId: caio.id,
      notes: 'Procura sala comercial perto do Centro.',
    });

    console.log(`Seed concluído. Entre com admin@demo.com.br / ${PASSWORD} (mesma senha para os demais usuários).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
