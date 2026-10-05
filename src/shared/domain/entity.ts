import { randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

/**
 * Entidade: objeto com identidade própria. Duas entidades são a mesma
 * quando têm o mesmo id, mesmo que os demais dados sejam diferentes.
 */
export abstract class Entity<Props> {
  protected constructor(
    readonly id: string,
    protected props: Props,
  ) {}

  equals(other?: Entity<unknown>): boolean {
    return !!other && other.constructor === this.constructor && other.id === this.id;
  }
}

/**
 * Raiz de agregado: a única porta de entrada para alterar o agregado.
 * Repositórios só existem para raízes de agregado.
 */
export abstract class AggregateRoot<Props> extends Entity<Props> {}
