import { beforeEach, describe, expect, it } from 'vitest';
import { buildInMemoryApp, type InMemoryApp, seedBasics } from '@/shared/testing/in-memory-app';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/shared/domain/errors';

describe('Imóveis', () => {
  let app: InMemoryApp;
  let seed: Awaited<ReturnType<typeof seedBasics>>;

  const house = (overrides: Record<string, unknown> = {}) => ({
    ownerId: seed.owner.id,
    title: 'Casa com quintal',
    type: 'HOUSE' as const,
    purpose: 'SALE' as const,
    salePriceCents: 800_000_00,
    bedrooms: 3,
    address: { street: 'Rua do Sol', number: '55', district: 'Batel', city: 'Curitiba', state: 'PR', zipCode: '80420000' },
    ...overrides,
  });

  beforeEach(async () => {
    app = await buildInMemoryApp();
    seed = await seedBasics(app);
  });

  it('cadastra o imóvel como disponível, com código sequencial', async () => {
    const second = await app.properties.registerProperty.execute(house());

    expect(seed.property).toMatchObject({ code: 1, status: 'AVAILABLE' });
    expect(second).toMatchObject({ code: 2, status: 'AVAILABLE', address: { zipCode: '80420000', complement: null } });
  });

  it('exige o preço correspondente à finalidade', async () => {
    await expect(app.properties.registerProperty.execute(house({ salePriceCents: null }))).rejects.toThrow('preço de venda');
    await expect(app.properties.registerProperty.execute(house({ purpose: 'RENT' }))).rejects.toThrow('valor de aluguel');
  });

  it('exige proprietário cadastrado', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';
    await expect(app.properties.registerProperty.execute(house({ ownerId: unknown }))).rejects.toThrow(NotFoundError);
  });

  it('altera só os campos informados', async () => {
    const updated = await app.properties.updateProperty.execute({ id: seed.property.id, rentPriceCents: 2_300_00, bedrooms: 3 });

    expect(updated).toMatchObject({ rentPriceCents: 2_300_00, bedrooms: 3, salePriceCents: 450_000_00, title: seed.property.title });
  });

  it('gerencia fotos: adiciona, reordena e remove', async () => {
    const id = seed.property.id;
    await app.properties.managePropertyPhotos.execute({ id, action: 'add', url: 'https://cdn.exemplo.com/sala.jpg', caption: 'Sala' });
    const withTwo = await app.properties.managePropertyPhotos.execute({ id, action: 'add', url: 'https://cdn.exemplo.com/quarto.jpg' });
    const [first, second] = withTwo.photos;

    const reordered = await app.properties.managePropertyPhotos.execute({ id, action: 'reorder', photoIds: [second!.id, first!.id] });
    expect(reordered.photos.map((photo) => photo.url)).toEqual(['https://cdn.exemplo.com/quarto.jpg', 'https://cdn.exemplo.com/sala.jpg']);

    await expect(app.properties.managePropertyPhotos.execute({ id, action: 'reorder', photoIds: [first!.id] })).rejects.toThrow(ValidationError);

    const removed = await app.properties.managePropertyPhotos.execute({ id, action: 'remove', photoId: first!.id });
    expect(removed.photos).toHaveLength(1);
  });

  it('busca por finalidade, faixa de preço e texto', async () => {
    await app.properties.registerProperty.execute(house());
    const search = (filters: Record<string, unknown>) =>
      app.properties.searchProperties.execute({ page: 1, perPage: 10, ...filters }).then((page) => page.items.map((item) => item.code));

    expect(await search({ purpose: 'RENT' })).toEqual([1]);
    expect(await search({ purpose: 'SALE' })).toEqual([1, 2]);
    expect(await search({ purpose: 'SALE', minPriceCents: 500_000_00 })).toEqual([2]);
    expect(await search({ search: 'quintal' })).toEqual([2]);
    expect(await search({ minBedrooms: 3 })).toEqual([2]);
  });

  it('imóvel inativo sai do mercado e pode voltar; só disponível pode ser inativado', async () => {
    const id = seed.property.id;
    expect((await app.properties.setPropertyListing.execute({ id, active: false })).status).toBe('INACTIVE');
    expect((await app.properties.setPropertyListing.execute({ id, active: true })).status).toBe('AVAILABLE');
    await expect(app.properties.setPropertyListing.execute({ id, active: true })).rejects.toThrow(BusinessRuleError);
  });
});
