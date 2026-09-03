import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, Query, UseGuards,
  } from '@nestjs/common';
  import { UpsellsService } from './upsells.service';
  import { JwtAuthGuard } from '../auth/jwt-auth.guard';
  
  @UseGuards(JwtAuthGuard)
  @Controller('upsells')
  export class UpsellsController {
    constructor(private upsells: UpsellsService) {}
  
    @Get()
    list(@Query('storeIds') storeIds?: string) {
      return this.upsells.list(storeIds ? storeIds.split(',') : undefined);
    }
    @Get('counts')
    counts() {
      return this.upsells.countByStore();
    }
  
    @Post('compute/:storeId')
    compute(
      @Param('storeId') storeId: string,
      @Body() body: { skus: string[]; orderDate?: string },
    ) {
      return this.upsells.computeUpsells(
        storeId,
        body.skus ?? [],
        body.orderDate ? new Date(body.orderDate) : undefined,
      );
    }
    @Post()
    create(@Body() body: any) {
      return this.upsells.create(body);
    }
  
    @Patch(':id')
    update(@Param('id') id: string, @Body() body: any) {
      return this.upsells.update(id, body);
    }
  
    @Delete(':id')
    remove(@Param('id') id: string) {
      return this.upsells.remove(id);
    }
  }