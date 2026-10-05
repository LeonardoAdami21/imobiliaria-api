import type { Page } from '@/shared/application/contracts';
import { InMemoryRepository } from '@/shared/testing/in-memory-repository';
import type { Property } from '../domain/property';
import type { PropertyFilters, PropertyRepository } from '../domain/property-repository';

export class InMemoryPropertyRepository extends InMemoryRepository<Property> implements PropertyRepository {
  private lastCode = 0;

  async nextCode(): Promise<number> {
    return ++this.lastCode;
  }

  async search(filters: PropertyFilters): Promise<Page<Property>> {
    const term = filters.search?.toLowerCase();
    const found = this.items.filter((property) => {
      const price = filters.purpose === 'RENT' ? property.rentPrice : property.salePrice;
      const hasPriceFilter = filters.minPriceCents !== undefined || filters.maxPriceCents !== undefined;
      return (
        (!filters.status || property.status === filters.status) &&
        (!filters.type || property.type === filters.type) &&
        (!filters.ownerId || property.ownerId === filters.ownerId) &&
        (!filters.purpose || (filters.purpose === 'SALE' ? property.forSale : property.forRent)) &&
        (!filters.city || property.address.city.toLowerCase() === filters.city.toLowerCase()) &&
        (!filters.district || property.address.district.toLowerCase().includes(filters.district.toLowerCase())) &&
        (filters.minBedrooms === undefined || property.bedrooms >= filters.minBedrooms) &&
        (!hasPriceFilter ||
          (price !== null &&
            price.cents >= (filters.minPriceCents ?? 0) &&
            price.cents <= (filters.maxPriceCents ?? Number.MAX_SAFE_INTEGER))) &&
        (!term ||
          property.title.toLowerCase().includes(term) ||
          property.address.street.toLowerCase().includes(term) ||
          String(property.code) === term)
      );
    });
    return this.paginate(found, filters);
  }
}
