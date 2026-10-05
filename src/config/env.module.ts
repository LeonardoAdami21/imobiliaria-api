import { Global, Module } from '@nestjs/common';
import { ENV, loadEnv } from './env';

/** Disponibiliza a configuração validada (token ENV) para toda a aplicação. */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }],
  exports: [ENV],
})
export class EnvModule {}
