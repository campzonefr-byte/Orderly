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
  