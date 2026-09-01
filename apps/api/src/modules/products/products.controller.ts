import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, Query, UseGuards, Request,
  } from '@nestjs/common';
  import { ProductsService } from './products.service';
  import { JwtAuthGuard } from '../auth/jwt-auth.guard';
  
  @UseGuards(JwtAuthGuard)
  @Controller('products')
  export class ProductsController {
    constructor(private products: ProductsService) {}
  
    @Get()
    list(@Query('storeIds') storeIds?: string) {
      return this.products.listWithStats(storeIds ? storeIds.split(',') : undefined);
    }
  
    @Get('summary')
    summary(@Query('storeIds') storeIds?: string) {
      return this.products.summary(storeIds ? storeIds.split(',') : undefined);
    }
    @Get('all')
  listAll(@Query('storeIds') storeIds?: string) {
    return this.products.listAll(storeIds ? storeIds.split(',') : undefined);
  }
  @Get(':id/offers')
  listOffers(@Param('id') id: string) {
    return this.products.listOffers(id);
  }

  @Post(':id/offers')
  createOffer(
    @Param('id') id: string,
    @Body() body: {
      quantity: number;
      priceType: 'FIXED' | 'PERCENT';
      price?: number;
      percent?: number;
      label?: string;
    },
  ) {
    return this.products.createOffer({ productId: id, ...body });
  }

  @Delete('offers/:offerId')
  removeOffer(@Param('offerId') offerId: string) {
    return this.products.removeOffer(offerId);
  }
  
  @Get(':id/aliases')
  listAliases(@Param('id') id: string) {
    return this.products.listAliases(id);
  }

  @Post(':id/aliases')
  addAlias(@Param('id') id: string, @Body() body: { alias: string }) {
    return this.products.addAlias(id, body.alias ?? '');
  }

  @Delete('aliases/:aliasId')
  removeAlias(@Param('aliasId') aliasId: string) {
    return this.products.removeAlias(aliasId);
  }
  @Get('price/:storeId/:sku')
  computePrice(
    @Param('storeId') storeId: string,
    @Param('sku') sku: string,
    @Query('quantity') quantity: string,
  ) {
    return this.products.computePrice(storeId, sku, parseInt(quantity) || 1);
  }
  @Post('relink/:storeId')
  relink(@Param('storeId') storeId: string) {
    return this.products.relinkOrderLines(storeId);
  }
  @Post('sync-easysell/:storeId')
  syncEasySell(@Param('storeId') storeId: string) {
    return this.products.syncEasySellOffers(storeId);
  }
    @Get(':id')
    getOne(@Param('id') id: string) {
      return this.products.getOne(id);
    }
  
    @Post()
    create(
      @Body() body: {
        storeId: string;
        sku: string;
        name: string;
        quantityAvailable?: number;
        lowStockThreshold?: number;
        costPrice?: number;
        sellPrice?: number;
      },
      @Request() req: any,
    ) {
      return this.products.create(body, req.user.id);
    }
  
    @Post(':id/adjust')
    adjust(
      @Param('id') id: string,
      @Body() body: {
        type: 'ADD' | 'REMOVE' | 'TO_DEFECTIVE' | 'FROM_DEFECTIVE' | 'SET';
        quantity: number;
        note?: string;
      },
      @Request() req: any,
    ) {
      return this.products.adjustStock(id, body, req.user.id);
    }
  
    @Patch(':id')
    update(
      @Param('id') id: string,
      @Body() body: any,
      @Request() req: any,
    ) {
      return this.products.updateProduct(id, body, req.user.id);
    }
  
    @Delete(':id')
    remove(@Param('id') id: string) {
      return this.products.remove(id);
    }
  }
  