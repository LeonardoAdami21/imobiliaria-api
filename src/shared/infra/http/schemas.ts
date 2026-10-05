import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { dateOnly } from '@/shared/domain/dates';

// ── Schemas reutilizados pelos DTOs dos módulos ──────────────────────────

export const idParams = z.object({ id: z.uuid() });

/** Parâmetro de rota ":id" (UUID). */
export class IdParamsDto extends createZodDto(idParams) {}

export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
};

/** Data de calendário no formato AAAA-MM-DD, entregue ao controller como Date (meia-noite UTC). */
export const calendarDate = z.iso.date().transform((value) => dateOnly(value));

/** Valor em centavos: R$ 1.500,00 = 150000. */
export const cents = z.number().int().nonnegative();
export const positiveCents = z.number().int().positive();

export const percent = z.number().min(0).max(100);

export const queryBoolean = z.enum(['true', 'false']).transform((value) => value === 'true');

export const optionalText = (max = 2000) => z.string().trim().max(max).nullish();
