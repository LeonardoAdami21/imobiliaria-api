import { z } from 'zod';
import type { UserRole } from '@/modules/identity/contracts';
import { cents, idParams, optionalText, pagination, positiveCents, type Route, route } from '@/shared/infra/http/route';
import type {
  GetProperty,
  ManagePropertyPhotos,
  RegisterProperty,
  SearchProperties,
  SetPropertyListing,
  UpdateProperty,
} from '../application/property-use-cases';
import { PROPERTY_PURPOSES, PROPERTY_STATUSES, PROPERTY_TYPES } from '../domain/property';

export interface PropertiesUseCases {
  registerProperty: RegisterProperty;
  updateProperty: UpdateProperty;
  getProperty: GetProperty;
  searchProperties: SearchProperties;
  managePropertyPhotos: ManagePropertyPhotos;
  setPropertyListing: SetPropertyListing;
}

const EDITORS: UserRole[] = ['ADMIN', 'MANAGER', 'BROKER'];

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

const photoParams = z.object({ id: z.uuid(), photoId: z.uuid() });

export function propertiesRoutes(useCases: PropertiesUseCases): Route[] {
  return [
    route({
      method: 'post',
      path: '/properties',
      tag: 'Imóveis',
      summary: 'Cadastrar imóvel',
      roles: EDITORS,
      status: 201,
      body: details.extend({ ownerId: z.uuid(), listingBrokerId: z.uuid().nullish() }),
      handler: ({ body }) => useCases.registerProperty.execute(body),
    }),
    route({
      method: 'get',
      path: '/properties',
      tag: 'Imóveis',
      summary: 'Buscar imóveis com filtros (situação, finalidade, cidade, preço, quartos)',
      query: z.object({
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
      handler: ({ query }) => useCases.searchProperties.execute(query),
    }),
    route({
      method: 'get',
      path: '/properties/:id',
      tag: 'Imóveis',
      summary: 'Consultar imóvel',
      params: idParams,
      handler: ({ params }) => useCases.getProperty.execute(params),
    }),
    route({
      method: 'patch',
      path: '/properties/:id',
      tag: 'Imóveis',
      summary: 'Alterar dados do imóvel',
      roles: EDITORS,
      params: idParams,
      body: details.partial().extend({ listingBrokerId: z.uuid().nullish() }),
      handler: ({ params, body }) => useCases.updateProperty.execute({ id: params.id, ...body }),
    }),
    route({
      method: 'post',
      path: '/properties/:id/photos',
      tag: 'Imóveis',
      summary: 'Adicionar foto (URL da imagem já hospedada)',
      roles: EDITORS,
      status: 201,
      params: idParams,
      body: z.object({ url: z.url({ protocol: /^https?$/ }), caption: optionalText(160) }),
      handler: ({ params, body }) => useCases.managePropertyPhotos.execute({ id: params.id, action: 'add', ...body }),
    }),
    route({
      method: 'put',
      path: '/properties/:id/photos/order',
      tag: 'Imóveis',
      summary: 'Reordenar fotos (a primeira é a capa)',
      roles: EDITORS,
      params: idParams,
      body: z.object({ photoIds: z.array(z.uuid()).min(1) }),
      handler: ({ params, body }) =>
        useCases.managePropertyPhotos.execute({ id: params.id, action: 'reorder', photoIds: body.photoIds }),
    }),
    route({
      method: 'delete',
      path: '/properties/:id/photos/:photoId',
      tag: 'Imóveis',
      summary: 'Remover foto',
      roles: EDITORS,
      status: 200,
      params: photoParams,
      handler: ({ params }) =>
        useCases.managePropertyPhotos.execute({ id: params.id, action: 'remove', photoId: params.photoId }),
    }),
    route({
      method: 'post',
      path: '/properties/:id/listing',
      tag: 'Imóveis',
      summary: 'Tirar o imóvel do anúncio (inativar) ou devolvê-lo ao mercado',
      roles: EDITORS,
      params: idParams,
      body: z.object({ active: z.boolean() }),
      handler: ({ params, body }) => useCases.setPropertyListing.execute({ id: params.id, active: body.active }),
    }),
  ];
}
