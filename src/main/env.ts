import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  AGENCY_NAME: z.string().min(1).default('Imobiliária'),
  CORS_ORIGIN: z.string().min(1).default('*'),
  /** Fuso usado para decidir que dia é "hoje" em vencimentos e atrasos. */
  BUSINESS_TIMEZONE: z.string().min(1).default('America/Sao_Paulo'),
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().min(2).default('8h'),
  ADMIN_NAME: z.string().min(2).default('Administrador'),
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
});

export type Env = z.infer<typeof schema>;

/** Lê e valida a configuração. Falha na inicialização, com mensagem clara, em vez de quebrar depois. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Configuração inválida. Confira o arquivo .env:\n${problems}`);
  }
  return result.data;
}
