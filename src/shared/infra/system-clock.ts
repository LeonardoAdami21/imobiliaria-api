import type { Clock } from '@/shared/application/contracts';
import { dateOnly } from '@/shared/domain/dates';

/**
 * Relógio real. "Hoje" é calculado no fuso da imobiliária: às 22h de Brasília
 * já é o dia seguinte em UTC, e um aluguel não pode vencer três horas mais cedo por isso.
 */
export class SystemClock implements Clock {
  private readonly formatter: Intl.DateTimeFormat;

  constructor(timeZone: string) {
    // O locale en-CA formata como AAAA-MM-DD.
    this.formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  now(): Date {
    return new Date();
  }

  today(): Date {
    return dateOnly(this.formatter.format(new Date()));
  }
}
