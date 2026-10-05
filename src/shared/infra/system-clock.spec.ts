import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDate } from '@/shared/domain/dates';
import { SystemClock } from './system-clock';

describe('SystemClock', () => {
  afterEach(() => vi.useRealTimers());

  it('calcula "hoje" no fuso da imobiliária, não em UTC', () => {
    // 22h30 de 10/03 em Brasília já é 01h30 de 11/03 em UTC.
    vi.useFakeTimers().setSystemTime(new Date('2026-03-11T01:30:00Z'));

    expect(formatDate(new SystemClock('America/Sao_Paulo').today())).toBe('2026-03-10');
    expect(formatDate(new SystemClock('UTC').today())).toBe('2026-03-11');
    expect(new SystemClock('America/Sao_Paulo').now().toISOString()).toBe('2026-03-11T01:30:00.000Z');
  });
});
