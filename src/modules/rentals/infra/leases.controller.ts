import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authenticated, Roles } from '@/shared/infra/http/auth';
import { IdParamsDto } from '@/shared/infra/http/schemas';
import { AdjustRent, CloseLease, CreateLease, GetLease, SearchLeases } from '../application/lease-use-cases';
import { AdjustRentDto, CloseLeaseDto, CreateLeaseDto, SearchLeasesQueryDto } from './dto';

/** Contratos e dinheiro ficam com gerência e financeiro; corretores apenas consultam. */
export const RENTAL_MANAGERS = ['ADMIN', 'MANAGER', 'FINANCE'];

@ApiTags('Locação')
@Authenticated()
@Controller('leases')
export class LeasesController {
  constructor(
    @Inject(CreateLease) private readonly createLease: CreateLease,
    @Inject(AdjustRent) private readonly adjustRent: AdjustRent,
    @Inject(CloseLease) private readonly closeLease: CloseLease,
    @Inject(GetLease) private readonly getLease: GetLease,
    @Inject(SearchLeases) private readonly searchLeases: SearchLeases,
  ) {}

  @Post()
  @Roles(...RENTAL_MANAGERS)
  @ApiOperation({ summary: 'Criar contrato de locação (gera as cobranças mensais e marca o imóvel como alugado)' })
  create(@Body() body: CreateLeaseDto) {
    return this.createLease.execute(body);
  }

  @Get()
  @ApiOperation({ summary: 'Listar contratos de locação' })
  search(@Query() query: SearchLeasesQueryDto) {
    return this.searchLeases.execute(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar contrato de locação' })
  get(@Param() params: IdParamsDto) {
    return this.getLease.execute(params);
  }

  @Post(':id/adjust-rent')
  @Roles(...RENTAL_MANAGERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aplicar o reajuste anual do aluguel' })
  adjust(@Param() params: IdParamsDto, @Body() body: AdjustRentDto) {
    return this.adjustRent.execute({ id: params.id, ...body });
  }

  @Post(':id/close')
  @Roles(...RENTAL_MANAGERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Encerrar ou rescindir o contrato e liberar o imóvel' })
  close(@Param() params: IdParamsDto, @Body() body: CloseLeaseDto) {
    return this.closeLease.execute({ id: params.id, ...body });
  }
}
