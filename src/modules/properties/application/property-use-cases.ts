import { mapPage, type Page, type UseCase } from '@/shared/application/contracts';
import { Address, type AddressProps } from '@/shared/domain/address';
import { NotFoundError } from '@/shared/domain/errors';
import { Money } from '@/shared/domain/money';
import type { PersonDirectory } from '@/modules/crm/contracts';
import type { UserDirectory } from '@/modules/identity/contracts';
import type { PropertyRegistry, PropertySummary } from '../contracts';
import { Property, type PropertyPhoto, type PropertyPurpose, type PropertyStatus, type PropertyType } from '../domain/property';
import type { PropertyFilters, PropertyRepository } from '../domain/property-repository';

export interface PropertyOutput {
  id: string;
  code: number;
  title: string;
  description: string | null;
  type: PropertyType;
  purpose: PropertyPurpose;
  status: PropertyStatus;
  ownerId: string;
  listingBrokerId: string | null;
  salePriceCents: number | null;
  rentPriceCents: number | null;
  condoFeeCents: number | null;
  propertyTaxCents: number | null;
  bedrooms: number;
  bathrooms: number;
  parkingSpaces: number;
  areaM2: number | null;
  address: AddressProps;
  photos: PropertyPhoto[];
  createdAt: Date;
  updatedAt: Date;
}

export function toPropertyOutput(property: Property): PropertyOutput {
  return {
    id: property.id,
    code: property.code,
    title: property.title,
    description: property.description,
    type: property.type,
    purpose: property.purpose,
    status: property.status,
    ownerId: property.ownerId,
    listingBrokerId: property.listingBrokerId,
    salePriceCents: property.salePrice?.cents ?? null,
    rentPriceCents: property.rentPrice?.cents ?? null,
    condoFeeCents: property.condoFee?.cents ?? null,
    propertyTaxCents: property.propertyTax?.cents ?? null,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    parkingSpaces: property.parkingSpaces,
    areaM2: property.areaM2,
    address: property.address.toJSON(),
    photos: [...property.photos],
    createdAt: property.createdAt,
    updatedAt: property.updatedAt,
  };
}

const money = (cents: number | null | undefined): Money | null => (cents == null ? null : Money.fromCents(cents));

export interface PropertyDetailsInput {
  title: string;
  description?: string | null;
  type: PropertyType;
  purpose: PropertyPurpose;
  salePriceCents?: number | null;
  rentPriceCents?: number | null;
  condoFeeCents?: number | null;
  propertyTaxCents?: number | null;
  bedrooms?: number;
  bathrooms?: number;
  parkingSpaces?: number;
  areaM2?: number | null;
  address: Omit<AddressProps, 'complement'> & { complement?: string | null };
}

export interface RegisterPropertyInput extends PropertyDetailsInput {
  ownerId: string;
  listingBrokerId?: string | null;
}

export class RegisterProperty implements UseCase<RegisterPropertyInput, PropertyOutput> {
  constructor(
    private readonly properties: PropertyRepository,
    private readonly people: PersonDirectory,
    private readonly users: UserDirectory,
  ) {}

  async execute(input: RegisterPropertyInput): Promise<PropertyOutput> {
    if (!(await this.people.findPerson(input.ownerId))) throw new NotFoundError('Proprietário');
    if (input.listingBrokerId && !(await this.users.findActiveUser(input.listingBrokerId))) {
      throw new NotFoundError('Corretor captador');
    }

    const property = Property.create({
      code: await this.properties.nextCode(),
      ownerId: input.ownerId,
      listingBrokerId: input.listingBrokerId ?? null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      type: input.type,
      purpose: input.purpose,
      salePrice: money(input.salePriceCents),
      rentPrice: money(input.rentPriceCents),
      condoFee: money(input.condoFeeCents),
      propertyTax: money(input.propertyTaxCents),
      bedrooms: input.bedrooms ?? 0,
      bathrooms: input.bathrooms ?? 0,
      parkingSpaces: input.parkingSpaces ?? 0,
      areaM2: input.areaM2 ?? null,
      address: Address.create(input.address),
    });
    await this.properties.save(property);
    return toPropertyOutput(property);
  }
}

export type UpdatePropertyInput = { id: string; listingBrokerId?: string | null } & Partial<PropertyDetailsInput>;

export class UpdateProperty implements UseCase<UpdatePropertyInput, PropertyOutput> {
  constructor(
    private readonly properties: PropertyRepository,
    private readonly users: UserDirectory,
  ) {}

  async execute({ id, ...input }: UpdatePropertyInput): Promise<PropertyOutput> {
    const property = await this.properties.findById(id);
    if (!property) throw new NotFoundError('Imóvel');
    if (input.listingBrokerId && !(await this.users.findActiveUser(input.listingBrokerId))) {
      throw new NotFoundError('Corretor captador');
    }

    const centsOrKeep = (cents: number | null | undefined): Money | null | undefined =>
      cents === undefined ? undefined : money(cents);

    property.updateDetails({
      title: input.title?.trim(),
      description: input.description === undefined ? undefined : input.description?.trim() || null,
      type: input.type,
      purpose: input.purpose,
      salePrice: centsOrKeep(input.salePriceCents),
      rentPrice: centsOrKeep(input.rentPriceCents),
      condoFee: centsOrKeep(input.condoFeeCents),
      propertyTax: centsOrKeep(input.propertyTaxCents),
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      parkingSpaces: input.parkingSpaces,
      areaM2: input.areaM2,
      listingBrokerId: input.listingBrokerId,
      address: input.address && Address.create(input.address).toJSON(),
    });
    await this.properties.save(property);
    return toPropertyOutput(property);
  }
}

export class GetProperty implements UseCase<{ id: string }, PropertyOutput> {
  constructor(private readonly properties: PropertyRepository) {}

  async execute({ id }: { id: string }): Promise<PropertyOutput> {
    const property = await this.properties.findById(id);
    if (!property) throw new NotFoundError('Imóvel');
    return toPropertyOutput(property);
  }
}

export class SearchProperties implements UseCase<PropertyFilters, Page<PropertyOutput>> {
  constructor(private readonly properties: PropertyRepository) {}

  async execute(filters: PropertyFilters): Promise<Page<PropertyOutput>> {
    return mapPage(await this.properties.search(filters), toPropertyOutput);
  }
}

export type ManagePhotosInput = { id: string } & (
  | { action: 'add'; url: string; caption?: string | null }
  | { action: 'remove'; photoId: string }
  | { action: 'reorder'; photoIds: string[] }
);

export class ManagePropertyPhotos implements UseCase<ManagePhotosInput, PropertyOutput> {
  constructor(private readonly properties: PropertyRepository) {}

  async execute(input: ManagePhotosInput): Promise<PropertyOutput> {
    const property = await this.properties.findById(input.id);
    if (!property) throw new NotFoundError('Imóvel');
    if (input.action === 'add') property.addPhoto(input.url, input.caption);
    else if (input.action === 'remove') property.removePhoto(input.photoId);
    else property.reorderPhotos(input.photoIds);
    await this.properties.save(property);
    return toPropertyOutput(property);
  }
}

/** Tira o imóvel do anúncio (inativo) ou o devolve ao mercado. */
export class SetPropertyListing implements UseCase<{ id: string; active: boolean }, PropertyOutput> {
  constructor(private readonly properties: PropertyRepository) {}

  async execute({ id, active }: { id: string; active: boolean }): Promise<PropertyOutput> {
    const property = await this.properties.findById(id);
    if (!property) throw new NotFoundError('Imóvel');
    if (active) property.activate();
    else property.deactivate();
    await this.properties.save(property);
    return toPropertyOutput(property);
  }
}

/** Implementação do contrato público consumido por CRM, locação e vendas. */
export class PropertyRegistryService implements PropertyRegistry {
  constructor(private readonly properties: PropertyRepository) {}

  async findProperty(id: string): Promise<PropertySummary | null> {
    const property = await this.properties.findById(id);
    return (
      property && {
        id: property.id,
        code: property.code,
        title: property.title,
        ownerId: property.ownerId,
        listingBrokerId: property.listingBrokerId,
        status: property.status,
        forSale: property.forSale,
        forRent: property.forRent,
      }
    );
  }

  reserve(id: string): Promise<void> {
    return this.change(id, (property) => property.reserve());
  }

  markAsRented(id: string): Promise<void> {
    return this.change(id, (property) => property.markAsRented());
  }

  markAsSold(id: string): Promise<void> {
    return this.change(id, (property) => property.markAsSold());
  }

  release(id: string): Promise<void> {
    return this.change(id, (property) => property.release());
  }

  private async change(id: string, action: (property: Property) => void): Promise<void> {
    const property = await this.properties.findById(id);
    if (!property) throw new NotFoundError('Imóvel');
    action(property);
    await this.properties.save(property);
  }
}
