import { ValidationError } from './errors';

/**
 * Valor em reais guardado em centavos (inteiro), para nunca somar
 * dinheiro com ponto flutuante. Imutável e nunca negativo.
 */
export class Money {
  private constructor(readonly cents: number) {}

  static fromCents(cents: number): Money {
    if (!Number.isSafeInteger(cents)) {
      throw new ValidationError('Valor monetário deve ser um número inteiro de centavos.');
    }
    if (cents < 0) throw new ValidationError('Valor monetário não pode ser negativo.');
    return new Money(cents);
  }

  /** Converte "1500.50" (formato do banco) em Money. */
  static fromDecimal(value: string): Money {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
    if (!match) throw new ValidationError(`Valor monetário inválido: "${value}".`);
    const fraction = (match[2] ?? '').padEnd(2, '0');
    return Money.fromCents(Number(match[1]) * 100 + Number(fraction));
  }

  static zero(): Money {
    return new Money(0);
  }

  add(other: Money): Money {
    return Money.fromCents(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    return Money.fromCents(this.cents - other.cents);
  }

  /** Aplica um percentual (ex.: 10 = 10%) arredondando para o centavo mais próximo. */
  percentage(percent: number): Money {
    return Money.fromCents(Math.round((this.cents * percent) / 100));
  }

  multiply(factor: number): Money {
    return Money.fromCents(Math.round(this.cents * factor));
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  greaterThan(other: Money): boolean {
    return this.cents > other.cents;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  /** "1500.50", formato aceito por colunas DECIMAL. */
  toDecimal(): string {
    const whole = Math.trunc(this.cents / 100);
    const fraction = String(this.cents % 100).padStart(2, '0');
    return `${whole}.${fraction}`;
  }
}

/** Percentual entre 0 e `max`, com no máximo duas casas decimais. */
export function assertPercent(value: number, label: string, max = 100): number {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new ValidationError(`${label} deve estar entre 0 e ${max}%.`);
  }
  const rounded = Math.round(value * 100) / 100;
  if (Math.abs(rounded - value) > 1e-9) {
    throw new ValidationError(`${label} aceita no máximo duas casas decimais.`);
  }
  return rounded;
}
