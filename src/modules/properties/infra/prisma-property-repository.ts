import type { Prisma } from '@/generated/prisma/client';
import type { Page } from '@/shared/application/contracts';
import { Address } from '@/shared/domain/address';
import { Money } from '@/shared/domain/money';
import { fromMoney, type PrismaContext, skipTake, toMoney, toNumber } from '@/shared/infra/database/prisma';
import { Property } from '../domain/property';
import type { PropertyFilters, PropertyRepository } from '../domain/property-repository';

const withPhotos = { photos: { orderBy: { position: 'asc' } } } satisfies Prisma.PropertyInclude;
type PropertyRow = Prisma.PropertyGetPayload<{ include: typeof withPhotos }>;

function toDomain(row: PropertyRow): Property {
  return Property.restore(row.id, {
    code: row.code,
    title: row.title,
    description: row.description,
    type: row.type,
    purpose: row.purpose,
    status: row.status,
    ownerId: row.ownerId,
    listingBrokerId: row.listingBrokerId,
    salePrice: toMoney(row.salePrice),
    rentPrice: toMoney(row.rentPrice),
    condoFee: toMoney(row.condoFee),
    propertyTax: toMoney(row.propertyTax),
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    parkingSpaces: row.parkingSpaces,
    areaM2: toNumber(row.areaM2),
    address: Address.create(row),
    photos: row.photos.map((photo) => ({ id: photo.id, url: photo.url, caption: photo.caption })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class PrismaPropertyRepository implements PropertyRepository {
  constructor(private readonly db: PrismaContext) {}

  async nextCode(): Promise<number> {
    // Usa a própria sequência da coluna "code", então nunca repete nem em requisições simultâneas.
    const [row] = await this.db.client.$queryRaw<{ code: bigint }[]>`
      SELECT nextval(pg_get_serial_sequence('properties', 'code')) AS code`;
    return Number(row!.code);
  }

  async findById(id: string): Promise<Property | null> {
    const row = await this.db.client.property.findUnique({ where: { id }, include: withPhotos });
    return row && toDomain(row);
  }

  async search(filters: PropertyFilters): Promise<Page<Property>> {
    const decimal = (cents?: number): string | undefined =>
      cents === undefined ? undefined : Money.fromCents(cents).toDecimal();
    const priceRange =
      filters.minPriceCents !== undefined || filters.maxPriceCents !== undefined
        ? { gte: decimal(filters.minPriceCents), lte: decimal(filters.maxPriceCents) }
        : undefined;
    const search = filters.search?.trim();

    const where: Prisma.PropertyWhereInput = {
      status: filters.status,
      type: filters.type,
      ownerId: filters.ownerId,
      purpose: filters.purpose ? { in: [filters.purpose, 'BOTH'] } : undefined,
      city: filters.city ? { equals: filters.city, mode: 'insensitive' } : undefined,
      district: filters.district ? { contains: filters.district, mode: 'insensitive' } : undefined,
      bedrooms: filters.minBedrooms !== undefined ? { gte: filters.minBedrooms } : undefined,
      ...(filters.purpose === 'RENT' ? { rentPrice: priceRange } : { salePrice: priceRange }),
      OR: search
        ? [
            { title: { contains: search, mode: 'insensitive' } },
            { street: { contains: search, mode: 'insensitive' } },
            ...(/^\d{1,9}$/.test(search) ? [{ code: Number(search) }] : []),
          ]
        : undefined,
    };

    const [rows, total] = await Promise.all([
      this.db.client.property.findMany({ where, include: withPhotos, orderBy: { code: 'desc' }, ...skipTake(filters) }),
      this.db.client.property.count({ where }),
    ]);
    return { items: rows.map(toDomain), total, page: filters.page, perPage: filters.perPage };
  }

  async save(property: Property): Promise<void> {
    const address = property.address;
    const data = {
      code: property.code,
      title: property.title,
      description: property.description,
      type: property.type,
      purpose: property.purpose,
      status: property.status,
      ownerId: property.ownerId,
      listingBrokerId: property.listingBrokerId,
      salePrice: fromMoney(property.salePrice),
      rentPrice: fromMoney(property.rentPrice),
      condoFee: fromMoney(property.condoFee),
      propertyTax: fromMoney(property.propertyTax),
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      parkingSpaces: property.parkingSpaces,
      areaM2: property.areaM2,
      street: address.street,
      number: address.number,
      complement: address.complement,
      district: address.district,
      city: address.city,
      state: address.state,
      zipCode: address.zipCode,
      createdAt: property.createdAt,
      updatedAt: property.updatedAt,
    };

    // Imóvel e fotos formam um agregado só: são gravados juntos, na mesma transação.
    await this.db.run(async () => {
      const client = this.db.client;
      await client.property.upsert({ where: { id: property.id }, create: { id: property.id, ...data }, update: data });
      await client.propertyPhoto.deleteMany({ where: { propertyId: property.id } });
      if (property.photos.length > 0) {
        await client.propertyPhoto.createMany({
          data: property.photos.map((photo, position) => ({ ...photo, propertyId: property.id, position })),
        });
      }
    });
  }
}
