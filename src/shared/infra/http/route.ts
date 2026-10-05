import { z, type ZodType } from 'zod';
import { dateOnly } from '@/shared/domain/dates';

/** Usuário autenticado que fez a requisição. */
export interface AuthUser {
  id: string;
  role: string;
}

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

type Parsed<S> = S extends ZodType ? z.output<S> : undefined;

interface RouteBase<P, Q, B> {
  method: HttpMethod;
  path: string;
  /** Agrupador na documentação (ex.: "Imóveis"). */
  tag: string;
  summary: string;
  params?: P;
  query?: Q;
  body?: B;
  /** Status de sucesso. Padrão: 200, ou 204 quando o handler não devolve nada. */
  status?: number;
}

export interface RouteConfig<P, Q, B> extends RouteBase<P, Q, B> {
  /** Papéis autorizados. Omitido = qualquer usuário autenticado. */
  roles?: readonly string[];
  handler: (request: { params: Parsed<P>; query: Parsed<Q>; body: Parsed<B>; user: AuthUser }) => Promise<unknown>;
}

export interface PublicRouteConfig<P, Q, B> extends RouteBase<P, Q, B> {
  handler: (request: { params: Parsed<P>; query: Parsed<Q>; body: Parsed<B> }) => Promise<unknown>;
}

/** Forma "apagada" da rota, usada para registrar no Express e gerar o OpenAPI. */
export interface Route extends RouteBase<ZodType | undefined, ZodType | undefined, ZodType | undefined> {
  public: boolean;
  roles?: readonly string[];
  handler: (request: { params: unknown; query: unknown; body: unknown; user: AuthUser }) => Promise<unknown>;
}

/**
 * Declara uma rota autenticada. Os schemas Zod validam a entrada e também
 * dão o tipo de `params`, `query` e `body` dentro do handler.
 */
export function route<
  P extends ZodType | undefined = undefined,
  Q extends ZodType | undefined = undefined,
  B extends ZodType | undefined = undefined,
>(config: RouteConfig<P, Q, B>): Route {
  return { ...config, public: false } as unknown as Route;
}

/** Declara uma rota sem autenticação (login, health check). */
export function publicRoute<
  P extends ZodType | undefined = undefined,
  Q extends ZodType | undefined = undefined,
  B extends ZodType | undefined = undefined,
>(config: PublicRouteConfig<P, Q, B>): Route {
  return { ...config, public: true } as unknown as Route;
}

// ── Schemas reutilizados pelas rotas ─────────────────────────────────────

export const idParams = z.object({ id: z.uuid() });

export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
};

/** Data de calendário no formato AAAA-MM-DD, entregue ao handler como Date (meia-noite UTC). */
export const calendarDate = z.iso.date().transform((value) => dateOnly(value));

/** Valor em centavos: R$ 1.500,00 = 150000. */
export const cents = z.number().int().nonnegative();
export const positiveCents = z.number().int().positive();

export const percent = z.number().min(0).max(100);

export const queryBoolean = z.enum(['true', 'false']).transform((value) => value === 'true');

export const optionalText = (max = 2000) => z.string().trim().max(max).nullish();
