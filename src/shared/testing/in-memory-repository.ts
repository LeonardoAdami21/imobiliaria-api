import type { Clock, Page, PageParams, Repository, UnitOfWork } from '@/shared/application/contracts';
import { dateOnly } from '@/shared/domain/dates';

/** Copia listas e objetos simples (ex.: fotos, pagamento); objetos de valor são imutáveis e podem ser compartilhados. */
function copyValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copyValue);
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyValue(item)]));
  }
  return value;
}

function snapshot<T>(entity: T): T {
  const copy = Object.create(Object.getPrototypeOf(entity)) as Record<string, unknown>;
  for (const [key, value] of Object.entries(entity as Record<string, unknown>)) copy[key] = copyValue(value);
  return copy as T;
}

/**
 * Repositório em memória usado nos testes unitários dos casos de uso.
 * Como um banco de verdade, guarda e devolve cópias: alterar uma entidade
 * sem chamar save() não muda o que está "gravado".
 */
export class InMemoryRepository<T extends { id: string }> implements Repository<T> {
  private readonly stored = new Map<string, T>();

  /** Cópia de tudo o que está gravado, na ordem de inserção. */
  get items(): T[] {
    return [...this.stored.values()].map(snapshot);
  }

  async findById(id: string): Promise<T | null> {
    const found = this.stored.get(id);
    return found ? snapshot(found) : null;
  }

  async save(entity: T): Promise<void> {
    this.stored.set(entity.id, snapshot(entity));
  }

  protected paginate(items: T[], { page, perPage }: PageParams): Page<T> {
    const start = (page - 1) * perPage;
    return { items: items.slice(start, start + perPage), total: items.length, page, perPage };
  }
}

/** Sem banco não há transação: apenas executa o trabalho. */
export class ImmediateUnitOfWork implements UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

/** Relógio parado em um instante escolhido pelo teste. Aceita "2026-03-10" ou "2026-03-10T14:00:00Z". */
export class FixedClock implements Clock {
  private current: Date;

  constructor(instant: string) {
    this.current = new Date(instant);
  }

  now(): Date {
    return this.current;
  }

  today(): Date {
    return dateOnly(this.current);
  }

  set(instant: string): void {
    this.current = new Date(instant);
  }
}
