import { Address, type AddressProps } from '@/shared/domain/address';
import { AggregateRoot, newId } from '@/shared/domain/entity';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/shared/domain/errors';
import type { Money } from '@/shared/domain/money';

export const PROPERTY_TYPES = ['HOUSE', 'APARTMENT', 'LAND', 'COMMERCIAL', 'RURAL', 'OTHER'] as const;
/** Casa, apartamento, terreno, comercial, rural ou outro. */
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_PURPOSES = ['SALE', 'RENT', 'BOTH'] as const;
/** Finalidade do anúncio: venda, locação ou as duas. */
export type PropertyPurpose = (typeof PROPERTY_PURPOSES)[number];

export const PROPERTY_STATUSES = ['AVAILABLE', 'RESERVED', 'RENTED', 'SOLD', 'INACTIVE'] as const;
/** Disponível, reservado (proposta aceita), alugado, vendido ou inativo (fora do anúncio). */
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const MAX_PHOTOS = 30;

export interface PropertyPhoto {
  id: string;
  url: string;
  caption: string | null;
}

export interface PropertyDetails {
  title: string;
  description: string | null;
  type: PropertyType;
  purpose: PropertyPurpose;
  salePrice: Money | null;
  rentPrice: Money | null;
  /** Condomínio mensal. */
  condoFee: Money | null;
  /** IPTU anual. */
  propertyTax: Money | null;
  bedrooms: number;
  bathrooms: number;
  parkingSpaces: number;
  areaM2: number | null;
  address: Address;
}

export interface PropertyProps extends PropertyDetails {
  code: number;
  status: PropertyStatus;
  ownerId: string;
  listingBrokerId: string | null;
  photos: PropertyPhoto[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePropertyInput extends PropertyDetails {
  code: number;
  ownerId: string;
  listingBrokerId: string | null;
}

/**
 * Imóvel anunciado pela imobiliária. É a raiz do agregado que inclui as fotos,
 * e o único lugar onde ficam as regras de mudança de situação.
 */
export class Property extends AggregateRoot<PropertyProps> {
  static create(input: CreatePropertyInput): Property {
    const now = new Date();
    const property = new Property(newId(), { ...input, status: 'AVAILABLE', photos: [], createdAt: now, updatedAt: now });
    property.assertValidDetails();
    return property;
  }

  static restore(id: string, props: PropertyProps): Property {
    return new Property(id, props);
  }

  private assertValidDetails(): void {
    const { title, salePrice, rentPrice, bedrooms, bathrooms, parkingSpaces, areaM2 } = this.props;
    if (title.trim().length < 3) throw new ValidationError('Título do imóvel deve ter pelo menos 3 caracteres.');
    for (const [label, value] of [['Quartos', bedrooms], ['Banheiros', bathrooms], ['Vagas', parkingSpaces]] as const) {
      if (!Number.isInteger(value) || value < 0) throw new ValidationError(`${label} deve ser um número inteiro não negativo.`);
    }
    if (areaM2 !== null && areaM2 <= 0) throw new ValidationError('Área deve ser maior que zero.');
    if (this.forSale && (!salePrice || salePrice.isZero())) {
      throw new BusinessRuleError('Imóvel à venda precisa ter preço de venda.', 'SALE_PRICE_REQUIRED');
    }
    if (this.forRent && (!rentPrice || rentPrice.isZero())) {
      throw new BusinessRuleError('Imóvel para locação precisa ter valor de aluguel.', 'RENT_PRICE_REQUIRED');
    }
  }

  get code(): number { return this.props.code; }
  get title(): string { return this.props.title; }
  get description(): string | null { return this.props.description; }
  get type(): PropertyType { return this.props.type; }
  get purpose(): PropertyPurpose { return this.props.purpose; }
  get status(): PropertyStatus { return this.props.status; }
  get ownerId(): string { return this.props.ownerId; }
  get listingBrokerId(): string | null { return this.props.listingBrokerId; }
  get salePrice(): Money | null { return this.props.salePrice; }
  get rentPrice(): Money | null { return this.props.rentPrice; }
  get condoFee(): Money | null { return this.props.condoFee; }
  get propertyTax(): Money | null { return this.props.propertyTax; }
  get bedrooms(): number { return this.props.bedrooms; }
  get bathrooms(): number { return this.props.bathrooms; }
  get parkingSpaces(): number { return this.props.parkingSpaces; }
  get areaM2(): number | null { return this.props.areaM2; }
  get address(): Address { return this.props.address; }
  get photos(): readonly PropertyPhoto[] { return this.props.photos; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  get forSale(): boolean { return this.props.purpose !== 'RENT'; }
  get forRent(): boolean { return this.props.purpose !== 'SALE'; }

  // ── Dados do anúncio ──

  updateDetails(
    changes: Partial<Omit<PropertyDetails, 'address'>> & { address?: AddressProps; listingBrokerId?: string | null },
  ): void {
    if (this.props.status === 'SOLD') {
      throw new BusinessRuleError('Imóvel vendido não pode mais ser alterado.', 'PROPERTY_SOLD');
    }
    const { address, ...rest } = changes;
    const inNegotiation = this.props.status === 'RESERVED' || this.props.status === 'RENTED';
    if (rest.purpose && rest.purpose !== this.props.purpose && inNegotiation) {
      throw new BusinessRuleError('A finalidade só pode mudar enquanto o imóvel não está em negociação.', 'PROPERTY_IN_NEGOTIATION');
    }
    // Só sobrescreve o que foi informado: undefined significa "manter como está".
    const informed = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
    this.props = { ...this.props, ...(informed as Partial<PropertyProps>) };
    if (address) this.props.address = Address.create(address);
    this.assertValidDetails();
    this.touch();
  }

  // ── Fotos ──

  addPhoto(url: string, caption?: string | null): PropertyPhoto {
    if (this.props.photos.length >= MAX_PHOTOS) {
      throw new BusinessRuleError(`Um imóvel pode ter no máximo ${MAX_PHOTOS} fotos.`, 'TOO_MANY_PHOTOS');
    }
    if (!/^https?:\/\/\S+$/i.test(url)) throw new ValidationError('URL da foto inválida.');
    const photo: PropertyPhoto = { id: newId(), url, caption: caption?.trim() || null };
    this.props.photos = [...this.props.photos, photo];
    this.touch();
    return photo;
  }

  removePhoto(photoId: string): void {
    if (!this.props.photos.some((photo) => photo.id === photoId)) throw new NotFoundError('Foto');
    this.props.photos = this.props.photos.filter((photo) => photo.id !== photoId);
    this.touch();
  }

  /** Reordena as fotos; a primeira da lista é a capa do anúncio. */
  reorderPhotos(photoIds: string[]): void {
    const current = this.props.photos;
    const sameSet = photoIds.length === current.length && current.every((photo) => photoIds.includes(photo.id));
    if (!sameSet || new Set(photoIds).size !== photoIds.length) {
      throw new ValidationError('A nova ordem deve conter exatamente as fotos atuais do imóvel.');
    }
    this.props.photos = photoIds.map((id) => current.find((photo) => photo.id === id)!);
    this.touch();
  }

  // ── Situação ──

  /** Proposta de compra aceita: o imóvel sai do mercado até a venda fechar ou a proposta cair. */
  reserve(): void {
    if (!this.forSale) throw new BusinessRuleError('Este imóvel não está à venda.', 'PROPERTY_NOT_FOR_SALE');
    this.transition(['AVAILABLE'], 'RESERVED', 'reservar');
  }

  markAsRented(): void {
    if (!this.forRent) throw new BusinessRuleError('Este imóvel não está disponível para locação.', 'PROPERTY_NOT_FOR_RENT');
    this.transition(['AVAILABLE'], 'RENTED', 'alugar');
  }

  markAsSold(): void {
    this.transition(['RESERVED'], 'SOLD', 'vender');
  }

  /** Proposta desfeita ou locação encerrada. */
  release(): void {
    this.transition(['RESERVED', 'RENTED'], 'AVAILABLE', 'liberar');
  }

  deactivate(): void {
    this.transition(['AVAILABLE'], 'INACTIVE', 'desativar');
  }

  activate(): void {
    this.transition(['INACTIVE'], 'AVAILABLE', 'reativar');
  }

  private transition(from: PropertyStatus[], to: PropertyStatus, action: string): void {
    if (!from.includes(this.props.status)) {
      throw new BusinessRuleError(
        `Não é possível ${action} um imóvel com situação ${this.props.status}.`,
        'INVALID_PROPERTY_STATUS',
      );
    }
    this.props.status = to;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
