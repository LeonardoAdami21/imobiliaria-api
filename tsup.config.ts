import { defineConfig } from 'tsup';

// Com emitDecoratorMetadata no tsconfig, o tsup compila com SWC, que emite os
// metadados de tipo usados pelo NestJS (validação dos DTOs e documentação Swagger).
export default defineConfig({
  entry: { main: 'src/main.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
});
