export interface PageParams {
  page: number;
  perPage: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
}

/**
 * Operações comuns a todo repositório de agregado. A interface vive no domínio;
 * a implementação (Prisma, memória) vive na infraestrutura.
 */
export interface Repository<T> {
  findById(id: string): Promise<T | null>;
  save(entity: T): Promise<void>;
}
