import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, Query, UseGuards, Request,
  } from '@nestjs/common';
  import { BundlesService } from './bundles.service';
  import { JwtAuthGuard } from '../auth/jwt-auth.guard';
  
  @UseGuards(JwtAuthGuard)
  @Controller('bundles')
  export class BundlesController {
    constructor(private bundles: BundlesService) {}
  
    @Get()
    list(@Query('storeIds') storeIds?: string) {
      return this.bundles.list(storeIds ? storeIds.split(',') : undefined);
    }
  
    @Get('products/:storeId')
    listProducts(@Param('storeId') storeId: string) {
      return this.bundles.listProducts(storeId);
    }
  
    @Post()
    create(@Body() body: {
      storeId: string;
      productId: string;
      name: string;
      components: { productId: string; quantity: number }[];
    }) {
      return this.bundles.create(body);
    }
  
    @Patch(':id')
    update(@Param('id') id: string, @Body() body: any) {
      return this.bundles.update(id, body);
    }
  
    @Delete(':id')
    remove(@Param('id') id: string) {
      return this.bundles.remove(id);
    }
  }