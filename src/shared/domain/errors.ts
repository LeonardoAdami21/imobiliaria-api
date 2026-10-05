/**
 * Erros conhecidos pela aplicação. Nenhum deles sabe o que é HTTP:
 * a tradução para status code acontece só na camada de infraestrutura.
 */
export type ErrorKind =
  | 'validation'
  | 'business_rule'
  | 'not_found'
  | 'conflict'
  | 'unauthorized'
  | 'forbidden';

export abstract class AppError extends Error {
  abstract readonly kind: ErrorKind;

  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Dado inválido: um valor que não pode existir (CPF errado, valor negativo). */
export class ValidationError extends AppError {
  readonly kind = 'validation';
  constructor(message: string, code = 'VALIDATION_ERROR') {
    super(message, code);
  }
}

/** Regra de negócio violada: o dado é válido, mas a operação não é permitida agora. */
export class BusinessRuleError extends AppError {
  readonly kind = 'business_rule';
  constructor(message: string, code = 'BUSINESS_RULE_VIOLATION') {
    super(message, code);
  }
}

export class NotFoundError extends AppError {
  readonly kind = 'not_found';
  constructor(resource: string) {
    super(`${resource} não encontrado(a).`, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  readonly kind = 'conflict';
  constructor(message: string, code = 'CONFLICT') {
    super(message, code);
  }
}

export class UnauthorizedError extends AppError {
  readonly kind = 'unauthorized';
  constructor(message = 'Credenciais inválidas.', code = 'UNAUTHORIZED') {
    super(message, code);
  }
}

export class ForbiddenError extends AppError {
  readonly kind = 'forbidden';
  constructor(message = 'Você não tem permissão para esta operação.') {
    super(message, 'FORBIDDEN');
  }
}
