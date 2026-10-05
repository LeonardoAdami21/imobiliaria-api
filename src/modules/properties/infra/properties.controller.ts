import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authenticated, Roles } from '@/shared/infra/http/auth';
import { IdParamsDto } from '@/shared/infra/http/schemas';
import {
  GetProperty,
  ManagePropertyPhotos,
  RegisterProperty,
  SearchProperties,
  SetPropertyListing,
  UpdateProperty,
} from '../application/property-use-cases';
import {
  AddPhotoDto,
  PhotoParamsDto,
  RegisterPropertyDto,
  ReorderPhotosDto,
  SearchPropertiesQueryDto,
  SetListingDto,
  UpdatePropertyDto,
} from './dto';

const EDITORS = ['ADMIN', 'MANAGER', 'BROKER'];

@ApiTags('Imóveis')
@Authenticated()
@Controller('properties')
export class PropertiesController {
  constructor(
    @Inject(RegisterProperty) private readonly registerProperty: RegisterProperty,
    @Inject(UpdateProperty) private readonly updateProperty: UpdateProperty,
    @Inject(GetProperty) private readonly getProperty: GetProperty,
    @Inject(SearchProperties) private readonly searchProperties: SearchProperties,
    @Inject(ManagePropertyPhotos) private readonly managePhotos: ManagePropertyPhotos,
    @Inject(SetPropertyListing) private readonly setListing: SetPropertyListing,
  ) {}

  @Post()
  @Roles(...EDITORS)
  @ApiOperation({ summary: 'Cadastrar imóvel' })
  register(@Body() body: RegisterPropertyDto) {
    return this.registerProperty.execute(body);
  }

  @Get()
  @ApiOperation({ summary: 'Buscar imóveis com filtros (situação, finalidade, cidade, preço, quartos)' })
  search(@Query() query: SearchPropertiesQueryDto) {
    return this.searchProperties.execute(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar imóvel' })
  get(@Param() params: IdParamsDto) {
    return this.getProperty.execute(params);
  }

  @Patch(':id')
  @Roles(...EDITORS)
  @ApiOperation({ summary: 'Alterar dados do imóvel' })
  update(@Param() params: IdParamsDto, @Body() body: UpdatePropertyDto) {
    return this.updateProperty.execute({ id: params.id, ...body });
  }

  @Post(':id/photos')
  @Roles(...EDITORS)
  @ApiOperation({ summary: 'Adicionar foto (URL da imagem já hospedada)' })
  addPhoto(@Param() params: IdParamsDto, @Body() body: AddPhotoDto) {
    return this.managePhotos.execute({ id: params.id, action: 'add', ...body });
  }

  @Put(':id/photos/order')
  @Roles(...EDITORS)
  @ApiOperation({ summary: 'Reordenar fotos (a primeira é a capa)' })
  reorderPhotos(@Param() params: IdParamsDto, @Body() body: ReorderPhotosDto) {
    return this.managePhotos.execute({ id: params.id, action: 'reorder', photoIds: body.photoIds });
  }

  @Delete(':id/photos/:photoId')
  @Roles(...EDITORS)
  @ApiOperation({ summary: 'Remover foto' })
  removePhoto(@Param() params: PhotoParamsDto) {
    return this.managePhotos.execute({ id: params.id, action: 'remove', photoId: params.photoId });
  }

  @Post(':id/listing')
  @Roles(...EDITORS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tirar o imóvel do anúncio (inativar) ou devolvê-lo ao mercado' })
  listing(@Param() params: IdParamsDto, @Body() body: SetListingDto) {
    return this.setListing.execute({ id: params.id, active: body.active });
  }
}
