import type { Page } from '@/shared/domain/repository';

/** Todo caso de uso tem uma única entrada e uma única saída. */
export interface UseCase<Input, Output> {
  execute(input: Input): Promise<Output>;
}

export type { Page, PageParams, Repository } from '@/shared/domain/repository';

export function mapPage<T, U>(page: Page<T>, mapper: (item: T) => U): Page<U> {
  return { ...page, items: page.items.map(mapper) };
}

/**
 * Unidade de trabalho: tudo o que for salvo dentro de `run` é gravado
 * junto ou nada é gravado. A aplicação não sabe que existe um banco SQL por trás.
 */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}

/** Quem executa a operação. Usado pelas regras que dependem do papel (ex.: carteira do corretor). */
export interface Actor {
  id: string;
  role: string;
}

/** Relógio injetável, para que testes controlem "agora" e "hoje". */
export interface Clock {
  /** Instante atual. */
  now(): Date;
  /** Data de calendário de hoje no fuso da imobiliária (meia-noite UTC, ver shared/domain/dates). */
  today(): Date;
}
