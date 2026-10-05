import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { UnitOfWork } from '@/shared/application/contracts';
import { Money } from '@/shared/domain/money';

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * Entrega aos repositórios a conexão certa: a transação em andamento,
 * quando o caso de uso abriu uma unidade de trabalho, ou a conexão normal.
 * O AsyncLocalStorage carrega a transação pela cadeia de chamadas assíncronas,
 * então nenhum caso de uso precisa repassar "tx" de mão em mão.
 */
export class PrismaContext implements UnitOfWork {
  private readonly storage = new AsyncLocalStorage<Prisma.TransactionClient>();

  constructor(private readonly prisma: PrismaClient) {}

  get client(): Prisma.TransactionClient {
    return this.storage.getStore() ?? this.prisma;
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.storage.getStore()) return work(); // já dentro de uma transação
    return this.prisma.$transaction((tx) => this.storage.run(tx, work), { timeout: 20_000 });
  }

  /** Chamado pelo NestJS no encerramento (app.close() / SIGTERM): fecha as conexões com o banco. */
  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// ── Conversões entre os tipos do banco e os do domínio ──────────────────

type DecimalLike = { toFixed(decimals: number): string };

export function toMoney(value: DecimalLike): Money;
export function toMoney(value: DecimalLike | null): Money | null;
export function toMoney(value: DecimalLike | null): Money | null {
  return value === null ? null : Money.fromDecimal(value.toFixed(2));
}

export function fromMoney(value: Money): string;
export function fromMoney(value: Money | null): string | null;
export function fromMoney(value: Money | null): string | null {
  return value === null ? null : value.toDecimal();
}

export function toNumber(value: DecimalLike): number;
export function toNumber(value: DecimalLike | null): number | null;
export function toNumber(value: DecimalLike | null): number | null {
  return value === null ? null : Number(value.toFixed(2));
}

export function skipTake({ page, perPage }: { page: number; perPage: number }): { skip: number; take: number } {
  return { skip: (page - 1) * perPage, take: perPage };
}
