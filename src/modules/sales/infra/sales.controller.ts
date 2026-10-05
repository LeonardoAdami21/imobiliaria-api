import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authenticated, type AuthUser, CurrentUser, Roles } from '@/shared/infra/http/auth';
import { IdParamsDto } from '@/shared/infra/http/schemas';
import { CloseSale, GetSale, ListCommissions, PayCommission, SearchSales } from '../application/sale-use-cases';
import { CloseSaleDto, CommissionParamsDto, ListCommissionsQueryDto, PayCommissionDto, SearchSalesQueryDto } from './dto';

@ApiTags('Vendas')
@Authenticated()
@Controller('sales')
export class SalesController {
  constructor(
    @Inject(CloseSale) private readonly closeSale: CloseSale,
    @Inject(PayCommission) private readonly payCommission: PayCommission,
    @Inject(GetSale) private readonly getSale: GetSale,
    @Inject(SearchSales) private readonly searchSales: SearchSales,
  ) {}

  @Post()
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Fechar a venda de uma proposta aceita e gerar as comissões' })
  close(@Body() body: CloseSaleDto) {
    return this.closeSale.execute(body);
  }

  @Get()
  @ApiOperation({ summary: 'Listar vendas' })
  search(@Query() query: SearchSalesQueryDto) {
    return this.searchSales.execute(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar venda e suas comissões' })
  get(@Param() params: IdParamsDto) {
    return this.getSale.execute(params);
  }

  @Post(':id/commissions/:commissionId/pay')
  @Roles('ADMIN', 'MANAGER', 'FINANCE')
  @HttpCode(HttpStatus.OK)
  @ApiTags('Comissões')
  @ApiOperation({ summary: 'Registrar o pagamento de uma comissão' })
  pay(@Param() params: CommissionParamsDto, @Body() body: PayCommissionDto) {
    return this.payCommission.execute({ saleId: params.id, commissionId: params.commissionId, paidAt: body.paidAt });
  }
}

@ApiTags('Comissões')
@Authenticated()
@Controller('commissions')
export class CommissionsController {
  constructor(@Inject(ListCommissions) private readonly listCommissions: ListCommissions) {}

  @Get()
  @ApiOperation({ summary: 'Relatório de comissões por corretor, situação e período (corretor vê apenas as suas)' })
  list(@Query() query: ListCommissionsQueryDto, @CurrentUser() user: AuthUser) {
    return this.listCommissions.execute(user.role === 'BROKER' ? { ...query, brokerId: user.id } : query);
  }
}
