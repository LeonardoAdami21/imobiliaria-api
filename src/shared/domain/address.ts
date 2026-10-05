import { ValidationError } from './errors';

export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export interface AddressProps {
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  zipCode: string;
}

export class Address {
  private constructor(private readonly props: AddressProps) {}

  static create(input: Omit<AddressProps, 'complement'> & { complement?: string | null }): Address {
    const state = input.state.trim().toUpperCase();
    if (!(BRAZILIAN_STATES as readonly string[]).includes(state)) {
      throw new ValidationError(`UF inválida: "${input.state}".`, 'INVALID_ADDRESS');
    }
    const zipCode = input.zipCode.replace(/\D/g, '');
    if (zipCode.length !== 8) throw new ValidationError('CEP deve ter 8 dígitos.', 'INVALID_ADDRESS');

    const required = (value: string, label: string): string => {
      const trimmed = value.trim();
      if (!trimmed) throw new ValidationError(`${label} é obrigatório(a) no endereço.`, 'INVALID_ADDRESS');
      return trimmed;
    };

    return new Address({
      street: required(input.street, 'Logradouro'),
      number: required(input.number, 'Número'),
      complement: input.complement?.trim() || null,
      district: required(input.district, 'Bairro'),
      city: required(input.city, 'Cidade'),
      state,
      zipCode,
    });
  }

  get street(): string { return this.props.street; }
  get number(): string { return this.props.number; }
  get complement(): string | null { return this.props.complement; }
  get district(): string { return this.props.district; }
  get city(): string { return this.props.city; }
  get state(): string { return this.props.state; }
  get zipCode(): string { return this.props.zipCode; }

  toJSON(): AddressProps {
    return { ...this.props };
  }
}
