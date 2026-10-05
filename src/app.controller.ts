import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Clock } from '@/shared/application/contracts';
import { Public } from '@/shared/infra/http/auth';
import { CLOCK } from '@/shared/tokens';

@ApiTags('Sistema')
@Controller()
export class AppController {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Verifica se a API está no ar' })
  health() {
    return { status: 'ok', time: this.clock.now() };
  }
}
