/**
 * Contrato público do módulo de imóveis. CRM, locação e vendas consultam
 * e mudam a situação de um imóvel só por aqui; as regras de transição
 * continuam dentro do agregado Property.
 */
export interface PropertySummary {
  id: string;
  code: number;
  title: string;
  ownerId: string;
  listingBrokerId: string | null;
  status: 'AVAILABLE' | 'RESERVED' | 'RENTED' | 'SOLD' | 'INACTIVE';
  forSale: boolean;
  forRent: boolean;
}

export interface PropertyRegistry {
  findProperty(id: string): Promise<PropertySummary | null>;
  /** Proposta de compra aceita: disponível → reservado. */
  reserve(id: string): Promise<void>;
  /** Contrato de locação assinado: disponível → alugado. */
  markAsRented(id: string): Promise<void>;
  /** Venda concluída: reservado → vendido. */
  markAsSold(id: string): Promise<void>;
  /** Proposta desfeita ou locação encerrada: volta a ficar disponível. */
  release(id: string): Promise<void>;
}
