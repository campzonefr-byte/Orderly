import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request,Query } from '@nestjs/common';
import { StoresService } from './stores.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('stores')
export class StoresController {
  constructor(private stores: StoresService) {}

  @Get()
  findAll() {
    return this.stores.findAll();
  }

  @Post()
  create(@Body() body: {
    name: string;
    sourceType: 'SHOPIFY' | 'CUSTOM' | 'MARKETPLACE';
    domain?: string;
    currency?: string;
  }) {
    return this.stores.create(body);
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string) {
    return this.stores.toggleActive(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Query('force') force?: string) {
    return this.stores.remove(id, force === 'true');
  }

  @Patch(':id/credentials')
  updateCredentials(
    @Param('id') id: string,
    @Body() body: Record<string, string>,
  ) {
    return this.stores.updateCredentials(id, body);
  }

  @Get(':id/shopify-products')
  getShopifyProducts(@Param('id') id: string) {
    return this.stores.getShopifyProducts(id);
  }

  @Post(':id/sync-products')
  syncProducts(
    @Param('id') id: string,
    @Body() body: { products: { externalId: string; name: string; sku: string; initialStock: number; threshold: number }[] },
    @Request() req: any,
  ) {
    return this.stores.syncProducts(id, body.products, req.user.id);
  }

  @Get(':id/products')
  getProducts(@Param('id') id: string) {
    return this.stores.getProducts(id);
  }

  @Patch('products/:productId')
  updateProduct(
    @Param('productId') productId: string,
    @Body() body: { quantityAvailable?: number; lowStockThreshold?: number; name?: string; note?: string },
    @Request() req: any,
  ) {
    return this.stores.updateProduct(productId, body, req.user.id, body.note);
  }

  @Delete('products/:productId')
  removeProduct(@Param('productId') productId: string) {
    return this.stores.removeProduct(productId);
  }

  @Get('products/:productId/logs')
  getInventoryLogs(@Param('productId') productId: string) {
    return this.stores.getInventoryLogs(productId);
  }
}