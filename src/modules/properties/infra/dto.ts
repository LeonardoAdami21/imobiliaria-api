import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { cents, optionalText, pagination, positiveCents } from '@/shared/infra/http/schemas';
import { PROPERTY_PURPOSES, PROPERTY_STATUSES, PROPERTY_TYPES } from '../domain/property';

const address = z.object({
  street: z.string().trim().min(1).max(160),
  number: z.string().trim().min(1).max(20),
  complement: optionalText(80),
  district: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().length(2).describe('UF, ex.: SP'),
  zipCode: z.string().trim().min(8).max(9).describe('CEP, com ou sem hífen'),
});

const details = z.object({
  title: z.string().trim().min(3).max(160),
  description: optionalText(5000),
  type: z.enum(PROPERTY_TYPES),
  purpose: z.enum(PROPERTY_PURPOSES),
  salePriceCents: positiveCents.nullish(),
  rentPriceCents: positiveCents.nullish(),
  condoFeeCents: cents.nullish(),
  propertyTaxCents: cents.nullish(),
  bedrooms: z.number().int().min(0).max(99).optional(),
  bathrooms: z.number().int().min(0).max(99).optional(),
  parkingSpaces: z.number().int().min(0).max(99).optional(),
  areaM2: z.number().positive().max(99_999_999).nullish(),
  address,
});

export class RegisterPropertyDto extends createZodDto(
  details.extend({ ownerId: z.uuid(), listingBrokerId: z.uuid().nullish() }),
) {}

export class UpdatePropertyDto extends createZodDto(details.partial().extend({ listingBrokerId: z.uuid().nullish() })) {}

export class SearchPropertiesQueryDto extends createZodDto(
  z.object({
    ...pagination,
    status: z.enum(PROPERTY_STATUSES).optional(),
    purpose: z.enum(['SALE', 'RENT']).optional(),
    type: z.enum(PROPERTY_TYPES).optional(),
    city: z.string().trim().max(80).optional(),
    district: z.string().trim().max(80).optional(),
    ownerId: z.uuid().optional(),
    minBedrooms: z.coerce.number().int().min(0).optional(),
    minPriceCents: z.coerce.number().int().min(0).optional(),
    maxPriceCents: z.coerce.number().int().min(0).optional(),
    search: z.string().trim().max(160).optional(),
  }),
) {}

export class AddPhotoDto extends createZodDto(
  z.object({ url: z.url({ protocol: /^https?$/ }), caption: optionalText(160) }),
) {}

export class ReorderPhotosDto extends createZodDto(z.object({ photoIds: z.array(z.uuid()).min(1) })) {}

export class PhotoParamsDto extends createZodDto(z.object({ id: z.uuid(), photoId: z.uuid() })) {}

export class SetListingDto extends createZodDto(z.object({ active: z.boolean() })) {}
