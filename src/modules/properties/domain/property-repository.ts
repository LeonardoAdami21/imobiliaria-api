import type { Page, PageParams, Repository } from '@/shared/domain/repository';
import type { Property, PropertyStatus, PropertyType } from './property';

export interface PropertyFilters extends PageParams {
  status?: PropertyStatus;
  /** SALE = imóveis à venda (inclui BOTH); RENT = imóveis para locação (inclui BOTH). */
  purpose?: 'SALE' | 'RENT';
  type?: PropertyType;
  city?: string;
  district?: string;
  ownerId?: string;
  minBedrooms?: number;
  /** Faixa de preço em centavos. Aplica-se ao aluguel quando purpose = RENT; caso contrário, ao preço de venda. */
  minPriceCents?: number;
  maxPriceCents?: number;
  /** Busca no título, na rua ou pelo código do imóvel. */
  search?: string;
}

export interface PropertyRepository extends Repository<Property> {
  /** Próximo código sequencial do imóvel (o número que aparece na placa e no anúncio). */
  nextCode(): Promise<number>;
  search(filters: PropertyFilters): Promise<Page<Property>>;
}
