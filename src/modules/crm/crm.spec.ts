import { beforeEach, describe, expect, it } from 'vitest';
import { buildInMemoryApp, cpf, type InMemoryApp, seedBasics } from '@/shared/testing/in-memory-app';
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '@/shared/domain/errors';

// Gerente: enxerga todos os leads, sem a restrição da carteira do corretor.
const manager = { id: 'gerente', role: 'MANAGER' };

describe('CRM', () => {
  let app: InMemoryApp;
  let seed: Awaited<ReturnType<typeof seedBasics>>;

  beforeEach(async () => {
    app = await buildInMemoryApp('2026-03-10T12:00:00Z');
    seed = await seedBasics(app);
  });

  describe('Pessoas', () => {
    it('define pessoa física ou jurídica pelo documento', async () => {
      const company = await app.crm.registerPerson.execute({ name: 'Construtora Alfa', document: '11.222.333/0001-81' });
      expect(company.type).toBe('COMPANY');
      expect(seed.owner.type).toBe('INDIVIDUAL');
    });

    it('não cadastra o mesmo documento duas vezes, nem documento inválido', async () => {
      await expect(app.crm.registerPerson.execute({ name: 'Outro', document: cpf(1) })).rejects.toThrow(ConflictError);
      await expect(app.crm.registerPerson.execute({ name: 'Outro', document: '123.456.789-00' })).rejects.toThrow(ValidationError);
    });

    it('encontra pessoa pelo nome ou pelo documento com pontuação', async () => {
      const byName = await app.crm.searchPeople.execute({ page: 1, perPage: 10, search: 'clara' });
      expect(byName.items.map((person) => person.id)).toEqual([seed.client.id]);

      const byDocument = await app.crm.searchPeople.execute({ page: 1, perPage: 10, search: seed.owner.documentFormatted });
      expect(byDocument.items.map((person) => person.id)).toEqual([seed.owner.id]);
    });
  });

  describe('Leads', () => {
    const contact = { name: 'Lia Lead', phone: '(41) 99999-0000', interest: 'BUY' as const, source: 'WEBSITE' as const, actor: manager };

    it('exige ao menos um contato', async () => {
      await expect(app.crm.createLead.execute({ ...contact, phone: null })).rejects.toThrow(BusinessRuleError);
    });

    it('lead novo passa a "em atendimento" ao receber um corretor', async () => {
      const lead = await app.crm.createLead.execute(contact);
      expect(lead).toMatchObject({ status: 'NEW', brokerId: null, phone: '41999990000' });

      const assigned = await app.crm.assignLead.execute({ id: lead.id, brokerId: seed.broker.id, actor: manager });
      expect(assigned).toMatchObject({ status: 'IN_SERVICE', brokerId: seed.broker.id });
    });

    it('o funil só avança; lead encerrado precisa ser reaberto', async () => {
      const lead = await app.crm.createLead.execute(contact);
      await app.crm.changeLeadStatus.execute({ id: lead.id, actor: manager, status: 'PROPOSAL' });
      await expect(app.crm.changeLeadStatus.execute({ id: lead.id, actor: manager, status: 'IN_SERVICE' })).rejects.toThrow(BusinessRuleError);

      const lost = await app.crm.changeLeadStatus.execute({ id: lead.id, actor: manager, status: 'LOST', reason: 'Comprou com outra imobiliária' });
      expect(lost).toMatchObject({ status: 'LOST', lostReason: 'Comprou com outra imobiliária' });
      await expect(app.crm.changeLeadStatus.execute({ id: lead.id, actor: manager, status: 'WON' })).rejects.toThrow(BusinessRuleError);

      const reopened = await app.crm.changeLeadStatus.execute({ id: lead.id, actor: manager, status: 'REOPEN' });
      expect(reopened).toMatchObject({ status: 'IN_SERVICE', lostReason: null });
    });

    it('lead ganho pode ser vinculado à pessoa cadastrada', async () => {
      const lead = await app.crm.createLead.execute(contact);
      const won = await app.crm.changeLeadStatus.execute({ id: lead.id, actor: manager, status: 'WON', personId: seed.client.id });
      expect(won).toMatchObject({ status: 'WON', personId: seed.client.id });
    });
  });

  describe('Carteira do corretor', () => {
    const contact = { name: 'Lia Lead', phone: '(41) 99999-0000', interest: 'BUY' as const, source: 'WEBSITE' as const };
    let broker: { id: string; role: string };
    let colleague: { id: string; role: string };

    beforeEach(async () => {
      broker = { id: seed.broker.id, role: 'BROKER' };
      const other = await app.identity.registerUser.execute({
        name: 'Caio Corretor',
        email: 'caio@imob.com.br',
        password: 'senha-forte-1',
        role: 'BROKER',
        creci: '54321-F',
      });
      colleague = { id: other.id, role: 'BROKER' };
    });

    it('lead registrado pelo corretor entra na carteira dele', async () => {
      const lead = await app.crm.createLead.execute({ ...contact, brokerId: colleague.id, actor: broker });
      expect(lead).toMatchObject({ brokerId: broker.id, status: 'IN_SERVICE' });
    });

    it('corretor lista só os próprios leads; gerente lista todos', async () => {
      const mine = await app.crm.createLead.execute({ ...contact, actor: broker });
      await app.crm.createLead.execute({ ...contact, name: 'Leo Lead', actor: colleague });
      await app.crm.createLead.execute({ ...contact, name: 'Sem Dono', actor: manager });

      const page = { page: 1, perPage: 10 };
      const seen = await app.crm.searchLeads.execute({ ...page, actor: broker });
      expect(seen.items.map((lead) => lead.id)).toEqual([mine.id]);
      // Pedir o corretor de outro ou os leads sem corretor não fura a carteira.
      expect((await app.crm.searchLeads.execute({ ...page, brokerId: colleague.id, actor: broker })).items.map((lead) => lead.id)).toEqual([mine.id]);
      expect((await app.crm.searchLeads.execute({ ...page, unassigned: true, actor: broker })).total).toBe(0);

      expect((await app.crm.searchLeads.execute({ ...page, actor: manager })).total).toBe(3);
    });

    it('lead de outra carteira não existe para o corretor', async () => {
      const other = await app.crm.createLead.execute({ ...contact, actor: colleague });

      await expect(app.crm.getLead.execute({ id: other.id, actor: broker })).rejects.toThrow(NotFoundError);
      await expect(app.crm.updateLead.execute({ id: other.id, notes: 'x', actor: broker })).rejects.toThrow(NotFoundError);
      await expect(app.crm.changeLeadStatus.execute({ id: other.id, status: 'PROPOSAL', actor: broker })).rejects.toThrow(NotFoundError);
      await expect(app.crm.assignLead.execute({ id: other.id, brokerId: broker.id, actor: broker })).rejects.toThrow(NotFoundError);
      await expect(
        app.crm.scheduleVisit.execute({
          leadId: other.id,
          propertyId: seed.property.id,
          brokerId: broker.id,
          scheduledAt: new Date('2026-03-12T14:00:00Z'),
          actor: broker,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('corretor pode transferir um lead seu, e depois deixa de vê-lo', async () => {
      const lead = await app.crm.createLead.execute({ ...contact, actor: broker });
      await app.crm.assignLead.execute({ id: lead.id, brokerId: colleague.id, actor: broker });

      await expect(app.crm.getLead.execute({ id: lead.id, actor: broker })).rejects.toThrow(NotFoundError);
      expect(await app.crm.getLead.execute({ id: lead.id, actor: colleague })).toMatchObject({ brokerId: colleague.id });
    });
  });

  describe('Visitas', () => {
    const schedule = (app: InMemoryApp, leadId: string, scheduledAt: string, overrides: { propertyId?: string; brokerId?: string } = {}) =>
      app.crm.scheduleVisit.execute({
        leadId,
        propertyId: overrides.propertyId ?? seed.property.id,
        brokerId: overrides.brokerId ?? seed.broker.id,
        scheduledAt: new Date(scheduledAt),
        actor: manager,
      });

    it('agendar visita avança o lead e o atribui ao corretor', async () => {
      const lead = await app.crm.createLead.execute({ name: 'Lia', email: 'lia@exemplo.com', interest: 'RENT', source: 'PORTAL', actor: manager });
      const visit = await schedule(app, lead.id, '2026-03-12T14:00:00Z');

      expect(visit.status).toBe('SCHEDULED');
      expect(await app.crm.getLead.execute({ id: lead.id, actor: manager })).toMatchObject({ status: 'VISIT_SCHEDULED', brokerId: seed.broker.id });
    });

    it('não agenda no passado nem em imóvel indisponível', async () => {
      const lead = await app.crm.createLead.execute({ name: 'Lia', email: 'lia@exemplo.com', interest: 'RENT', source: 'PORTAL', actor: manager });
      await expect(schedule(app, lead.id, '2026-03-09T14:00:00Z')).rejects.toThrow('data futura');

      await app.properties.setPropertyListing.execute({ id: seed.property.id, active: false });
      await expect(schedule(app, lead.id, '2026-03-12T14:00:00Z')).rejects.toThrow('imóvel disponível');
    });

    it('impede duas visitas do mesmo corretor ou imóvel no mesmo horário', async () => {
      const lead = await app.crm.createLead.execute({ name: 'Lia', email: 'lia@exemplo.com', interest: 'RENT', source: 'PORTAL', actor: manager });
      const other = await app.crm.createLead.execute({ name: 'Leo', email: 'leo@exemplo.com', interest: 'RENT', source: 'PORTAL', actor: manager });
      await schedule(app, lead.id, '2026-03-12T14:00:00Z');

      await expect(schedule(app, other.id, '2026-03-12T14:30:00Z')).rejects.toThrow(ConflictError);
      await expect(schedule(app, other.id, '2026-03-12T15:00:00Z')).resolves.toMatchObject({ status: 'SCHEDULED' });
    });

    it('visita encerrada não pode ser remarcada', async () => {
      const lead = await app.crm.createLead.execute({ name: 'Lia', email: 'lia@exemplo.com', interest: 'RENT', source: 'PORTAL', actor: manager });
      const visit = await schedule(app, lead.id, '2026-03-12T14:00:00Z');

      const done = await app.crm.finishVisit.execute({ id: visit.id, outcome: 'DONE', feedback: 'Gostou da sala' });
      expect(done).toMatchObject({ status: 'DONE', feedback: 'Gostou da sala' });
      await expect(app.crm.rescheduleVisit.execute({ id: visit.id, scheduledAt: new Date('2026-03-13T14:00:00Z') })).rejects.toThrow(BusinessRuleError);
    });
  });
});
