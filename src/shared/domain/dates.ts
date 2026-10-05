import { ValidationError } from './errors';

/**
 * Datas de calendário (vencimento, início de contrato) não têm hora nem fuso.
 * Aqui elas são sempre um Date à meia-noite UTC, e todas as contas usam UTC,
 * para que "dia 10" seja dia 10 em qualquer servidor.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export function dateOnly(input: string | Date): Date {
  if (typeof input === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (!match) throw new ValidationError(`Data inválida: "${input}". Use o formato AAAA-MM-DD.`);
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new ValidationError(`Data inexistente: "${input}".`);
    }
    return date;
  }
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Soma meses mantendo o dia; se o mês de destino for mais curto, usa o último dia dele. */
export function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const target = new Date(Date.UTC(year, month, 1));
  const day = Math.min(date.getUTCDate(), lastDayOfMonth(target.getUTCFullYear(), target.getUTCMonth()));
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Mesmo mês de `date`, no dia informado (limitado ao último dia do mês). */
export function withDay(date: Date, day: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return new Date(Date.UTC(year, month, Math.min(day, lastDayOfMonth(year, month))));
}

/** Dias corridos de `from` até `to` (negativo se `to` for anterior). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((dateOnly(to).getTime() - dateOnly(from).getTime()) / DAY_MS);
}

export function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}
