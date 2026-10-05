import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { z } from 'zod';
import type { Env } from './config/env';

// Mensagens de validação do Zod em português.
z.config(z.locales.pt());

/**
 * Exemplos por formato. Sem eles o Swagger UI gera um texto aleatório que casa com a regex
 * do Zod (um "e-mail" de 4 mil caracteres, datas no ano 8396).
 */
const EXAMPLE_BY_FORMAT: Record<string, string> = {
  email: 'nome@imobiliaria.com.br',
  uuid: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  date: '2026-03-10',
  'date-time': '2026-03-10T14:00:00-03:00',
};

function addFormatExamples(node: unknown): void {
  if (!node || typeof node !== 'object') return;
  const schema = node as Record<string, unknown>;
  const example = typeof schema.format === 'string' ? EXAMPLE_BY_FORMAT[schema.format] : undefined;
  if (example && schema.example === undefined) schema.example = example;
  for (const child of Object.values(schema)) addFormatExamples(child);
}

/** Middlewares, CORS e documentação. Compartilhado por main.ts e pelos testes de ponta a ponta. */
export function configureApp(app: NestExpressApplication, env: Pick<Env, 'AGENCY_NAME' | 'CORS_ORIGIN'>): void {
  const title = `API ${env.AGENCY_NAME}`;

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false })); // CSP desligada por causa da página do Swagger
  app.enableCors({ origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((o) => o.trim()) });
  app.useBodyParser('json', { limit: '1mb' });
  // JSON malformado: o body-parser falha antes do Nest, que só repassaria um "Bad Request" genérico.
  app.use((error: { type?: string }, _request: Request, response: Response, next: NextFunction) => {
    if (error.type !== 'entity.parse.failed') return next(error);
    response.status(400).json({ error: { code: 'INVALID_JSON', message: 'O corpo da requisição não é um JSON válido.' } });
  });

  const config = new DocumentBuilder()
    .setTitle(title)
    .setVersion('0.1.0')
    .setDescription(
      'Valores em dinheiro são enviados e devolvidos em centavos (R$ 1.500,00 = 150000). ' +
        'Datas de calendário usam o formato AAAA-MM-DD. ' +
        'Erros seguem o formato { "error": { "code", "message" } }.',
    )
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
  addFormatExamples(document);
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs.json', customSiteTitle: title });
}
