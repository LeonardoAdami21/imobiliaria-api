import { describe, expect, it } from 'vitest';
import { cpf } from '@/main/testing';
import { Address } from './address';
import { addMonths, dateOnly, daysBetween, formatDate, withDay } from './dates';
import { Document } from './document';
import { Email } from './email';
import { ValidationError } from './errors';
import { assertPercent, Money } from './money';

describe('Money', () => {
  it('converte entre centavos e o formato decimal do banco', () => {
    expect(Money.fromDecimal('1500.5').cents).toBe(150050);
    expect(Money.fromDecimal('1500').cents).toBe(150000);
    expect(Money.fromCents(150050).toDecimal()).toBe('1500.50');
    expect(Money.fromCents(5).toDecimal()).toBe('0.05');
  });

  it('calcula percentual arredondando para o centavo', () => {
    expect(Money.fromCents(200_000).percentage(10).cents).toBe(20_000);
    expect(Money.fromCents(333).percentage(10).cents).toBe(33);
  });

  it('não aceita valor negativo nem fracionado', () => {
    expect(() => Money.fromCents(-1)).toThrow(ValidationError);
    expect(() => Money.fromCents(10.5)).toThrow(ValidationError);
    expect(() => Money.fromCents(100).subtract(Money.fromCents(101))).toThrow(ValidationError);
  });

  it('valida percentuais', () => {
    expect(assertPercent(10.25, 'Taxa')).toBe(10.25);
    expect(() => assertPercent(101, 'Taxa')).toThrow(ValidationError);
    expect(() => assertPercent(1.234, 'Taxa')).toThrow(ValidationError);
  });
});

describe('Document', () => {
  it('aceita CPF válido com ou sem pontuação', () => {
    const document = Document.create('529.982.247-25');
    expect(document.kind).toBe('CPF');
    expect(document.value).toBe('52998224725');
    expect(document.formatted).toBe('529.982.247-25');
    expect(Document.create(cpf(7)).kind).toBe('CPF');
  });

  it('rejeita CPF com dígito verificador errado ou dígitos repetidos', () => {
    expect(() => Document.create('529.982.247-26')).toThrow(ValidationError);
    expect(() => Document.create('111.111.111-11')).toThrow(ValidationError);
  });

  it('aceita CNPJ numérico e o novo CNPJ alfanumérico', () => {
    expect(Document.create('11.222.333/0001-81').kind).toBe('CNPJ');
    const alphanumeric = Document.create('12.ABC.345/01DE-35');
    expect(alphanumeric.kind).toBe('CNPJ');
    expect(alphanumeric.formatted).toBe('12.ABC.345/01DE-35');
  });

  it('rejeita CNPJ inválido e documentos de tamanho errado', () => {
    expect(() => Document.create('11.222.333/0001-82')).toThrow(ValidationError);
    expect(() => Document.create('12.ABC.345/01DE-36')).toThrow(ValidationError);
    expect(() => Document.create('123')).toThrow(ValidationError);
  });
});

describe('Datas de calendário', () => {
  it('interpreta AAAA-MM-DD sem depender de fuso', () => {
    expect(formatDate(dateOnly('2026-03-10'))).toBe('2026-03-10');
    expect(() => dateOnly('2026-02-30')).toThrow(ValidationError);
    expect(() => dateOnly('10/03/2026')).toThrow(ValidationError);
  });

  it('soma meses respeitando o fim do mês', () => {
    expect(formatDate(addMonths(dateOnly('2026-01-31'), 1))).toBe('2026-02-28');
    expect(formatDate(addMonths(dateOnly('2026-11-15'), 3))).toBe('2027-02-15');
    expect(formatDate(withDay(dateOnly('2026-02-01'), 31))).toBe('2026-02-28');
  });

  it('conta dias corridos', () => {
    expect(daysBetween(dateOnly('2026-03-05'), dateOnly('2026-03-20'))).toBe(15);
    expect(daysBetween(dateOnly('2026-03-20'), dateOnly('2026-03-05'))).toBe(-15);
  });
});

describe('Email e Address', () => {
  it('normaliza e valida e-mail', () => {
    expect(Email.create('  Ana@Exemplo.COM ').value).toBe('ana@exemplo.com');
    expect(() => Email.create('ana@')).toThrow(ValidationError);
  });

  it('valida UF e CEP do endereço', () => {
    const base = { street: 'Rua A', number: '1', district: 'Centro', city: 'Curitiba', state: 'pr', zipCode: '80010-000' };
    const address = Address.create(base);
    expect(address.state).toBe('PR');
    expect(address.zipCode).toBe('80010000');
    expect(() => Address.create({ ...base, state: 'XX' })).toThrow(ValidationError);
    expect(() => Address.create({ ...base, zipCode: '123' })).toThrow(ValidationError);
  });
});
