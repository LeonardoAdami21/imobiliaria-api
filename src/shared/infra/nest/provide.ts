import type { FactoryProvider, InjectionToken } from '@nestjs/common';

type Constructor = new (...args: any[]) => unknown;

/** Um token de injeção para cada parâmetro do construtor, na mesma ordem. */
type Tokens<Params extends unknown[]> = { [K in keyof Params]: InjectionToken };
type TokensFor<C extends Constructor> = Tokens<ConstructorParameters<C>>;

/**
 * Registra no NestJS uma classe que não conhece o framework (caso de uso, repositório):
 * o Nest resolve os tokens e chama o construtor. Assim a camada de aplicação
 * continua sem decorators, e trocar uma implementação é trocar o token aqui.
 *
 *   provide(CreateLead, [LEAD_REPOSITORY, USER_DIRECTORY, PROPERTY_REGISTRY])
 *   provide(PrismaLeadRepository, [PrismaContext], LEAD_REPOSITORY)
 */
export function provide<C extends Constructor>(
  useClass: C,
  inject: TokensFor<C>,
  token: InjectionToken = useClass,
): FactoryProvider {
  return {
    provide: token,
    useFactory: (...deps: ConstructorParameters<C>) => new useClass(...deps),
    inject: inject as InjectionToken[],
  };
}
