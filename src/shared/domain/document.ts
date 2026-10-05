import { ValidationError } from './errors';

export type DocumentKind = 'CPF' | 'CNPJ';

/**
 * CPF ou CNPJ validado pelos dígitos verificadores.
 * Aceita o CNPJ alfanumérico (letras nas 12 primeiras posições),
 * em vigor na Receita Federal desde julho de 2026.
 */
export class Document {
  private constructor(
    readonly value: string,
    readonly kind: DocumentKind,
  ) {}

  static create(raw: string): Document {
    const value = raw.replace(/[.\-/\s]/g, '').toUpperCase();
    if (/^\d{11}$/.test(value)) {
      if (!isValidCpf(value)) throw new ValidationError('CPF inválido.', 'INVALID_DOCUMENT');
      return new Document(value, 'CPF');
    }
    if (/^[0-9A-Z]{12}\d{2}$/.test(value)) {
      if (!isValidCnpj(value)) throw new ValidationError('CNPJ inválido.', 'INVALID_DOCUMENT');
      return new Document(value, 'CNPJ');
    }
    throw new ValidationError('Documento deve ser um CPF (11 dígitos) ou CNPJ (14 caracteres).', 'INVALID_DOCUMENT');
  }

  get formatted(): string {
    const v = this.value;
    return this.kind === 'CPF'
      ? `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`
      : `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
  }

  equals(other: Document): boolean {
    return this.value === other.value;
  }
}

function isValidCpf(cpf: string): boolean {
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

function isValidCnpj(cnpj: string): boolean {
  if (/^(.)\1{13}$/.test(cnpj)) return false;
  // Cada caractere vale o seu código ASCII menos 48: '0'..'9' = 0..9 e 'A'..'Z' = 17..42.
  const valueOf = (char: string): number => char.charCodeAt(0) - 48;
  const digit = (length: number): number => {
    let sum = 0;
    let weight = 2;
    for (let i = length - 1; i >= 0; i--) {
      sum += valueOf(cnpj[i]!) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}
