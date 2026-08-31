import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, Query, UseGuards,
  } from '@nestjs/common';
  import { ShippingService } from './shipping.service';
  import { JwtAuthGuard } from '../auth/jwt-auth.guard';
  
  @UseGuards(JwtAuthGuard)
  @Controller('shipping')
  export class ShippingController {
    constructor(private shipping: ShippingService) {}
  
    @Get('rules')
    list(@Query('storeIds') storeIds?: string) {
      return this.shipping.list(storeIds ? storeIds.split(',') : undefined);
    }
  
    @Get('rules/store/:storeId')
    getForStore(@Param('storeId') storeId: string) {
      return this.shipping.getForStore(storeId);
    }
  
    @Get('calculate/:storeId')
    calculate(
      @Param('storeId') storeId: string,
      @Query('subtotal') subtotal: string,
      @Query('city') city?: string,
    ) {
      return this.shipping.calculate(storeId, parseFloat(subtotal) || 0, city);
    }
  
    @Post('rules')
    create(@Body() body: any) {
      return this.shipping.create(body);
    }
  
    @Patch('rules/:id')
    update(@Param('id') id: string, @Body() body: any) {
      return this.shipping.update(id, body);
    }
  
    @Delete('rules/:id')
    remove(@Param('id') id: string) {
      return this.shipping.remove(id);
    }
  }