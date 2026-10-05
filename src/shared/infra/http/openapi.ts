import { z, type ZodType } from 'zod';
import type { Route } from './route';

type JsonSchema = Record<string, unknown>;

function toSchema(schema: ZodType): JsonSchema {
  // io: 'input' descreve o que o cliente envia (antes de transformações e valores padrão).
  return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as JsonSchema;
}

function toParameters(schema: ZodType | undefined, location: 'path' | 'query'): JsonSchema[] {
  if (!schema) return [];
  const json = toSchema(schema);
  const properties = (json.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set((json.required as string[] | undefined) ?? []);
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: location,
    required: location === 'path' || required.has(name),
    schema: property,
  }));
}

/** Gera o documento OpenAPI 3.1 a partir das mesmas rotas que o Express registra. */
export function buildOpenApiDocument(routes: Route[], title: string): JsonSchema {
  const paths: Record<string, Record<string, JsonSchema>> = {};

  for (const route of routes) {
    const path = route.path.replace(/:(\w+)/g, '{$1}');
    const responses: Record<string, JsonSchema> = {
      [String(route.status ?? 200)]: { description: 'Sucesso' },
      '400': { description: 'Dados inválidos' },
    };
    if (!route.public) {
      responses['401'] = { description: 'Não autenticado' };
      if (route.roles) responses['403'] = { description: `Restrito a: ${route.roles.join(', ')}` };
    }

    (paths[path] ??= {})[route.method] = {
      tags: [route.tag],
      summary: route.summary,
      ...(route.roles ? { description: `Papéis autorizados: ${route.roles.join(', ')}.` } : {}),
      security: route.public ? [] : [{ bearerAuth: [] }],
      parameters: [...toParameters(route.params, 'path'), ...toParameters(route.query, 'query')],
      ...(route.body
        ? { requestBody: { required: true, content: { 'application/json': { schema: toSchema(route.body) } } } }
        : {}),
      responses,
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title,
      version: '0.1.0',
      description:
        'Valores em dinheiro são enviados e devolvidos em centavos (R$ 1.500,00 = 150000). ' +
        'Datas de calendário usam o formato AAAA-MM-DD. ' +
        'Erros seguem o formato { "error": { "code", "message" } }.',
    },
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    paths,
  };
}
