import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authenticated, Roles } from '@/shared/infra/http/auth';
import { IdParamsDto } from '@/shared/infra/http/schemas';
import { PayCharge, QuoteCharge, RegisterOwnerTransfer, SearchCharges } from '../application/charge-use-cases';
import { OwnerTransferDto, PayChargeDto, QuoteChargeQueryDto, SearchChargesQueryDto } from './dto';
import { RENTAL_MANAGERS } from './leases.controller';

@ApiTags('Cobranças')
@Authenticated()
@Controller('charges')
export class ChargesController {
  constructor(
    @Inject(SearchCharges) private readonly searchCharges: SearchCharges,
    @Inject(QuoteCharge) private readonly quoteCharge: QuoteCharge,
    @Inject(PayCharge) private readonly payCharge: PayCharge,
    @Inject(RegisterOwnerTransfer) private readonly registerOwnerTransfer: RegisterOwnerTransfer,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar cobranças de aluguel (por contrato, situação, atrasadas, repasse pendente)' })
  search(@Query() query: SearchChargesQueryDto) {
    return this.searchCharges.execute(query);
  }

  @Get(':id/quote')
  @ApiOperation({ summary: 'Calcular o valor atualizado da cobrança (com multa e juros) para uma data' })
  quote(@Param() params: IdParamsDto, @Query() query: QuoteChargeQueryDto) {
    return this.quoteCharge.execute({ id: params.id, date: query.date });
  }

  @Post(':id/pay')
  @Roles(...RENTAL_MANAGERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dar baixa no pagamento do aluguel' })
  pay(@Param() params: IdParamsDto, @Body() body: PayChargeDto) {
    return this.payCharge.execute({ id: params.id, paidAt: body.paidAt });
  }

  @Post(':id/transfer')
  @Roles(...RENTAL_MANAGERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar o repasse ao proprietário' })
  transfer(@Param() params: IdParamsDto, @Body() body: OwnerTransferDto) {
    return this.registerOwnerTransfer.execute({ id: params.id, date: body.date });
  }
}
