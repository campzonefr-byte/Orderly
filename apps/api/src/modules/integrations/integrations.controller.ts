import { Controller, Get, Post, Body, Param, Query, Res, UseGuards, SetMetadata } from '@nestjs/common';
import type { Response } from 'express';
import { ConvertyService } from './converty.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ShopifyService } from './shopify.service';

@Controller('integrations')
export class IntegrationsController {
  constructor(
    private converty: ConvertyService,
    private shopify: ShopifyService,
  ) {}

  // --- OAuth callback (public, called by Converty) ---
  @Get('converty/callback')
  @SetMetadata('isPublic', true)
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const frontend = process.env.FRONTEND_URL ?? 'https://orderly-beige.vercel.app';

    if (!code || !state) {
      return res.redirect(`${frontend}/stores?converty=error`);
    }

    const result = await this.converty.handleCallback(code, state);
    if (!result.ok) {
      return res.redirect(`${frontend}/stores?converty=error`);
    }

    // Auto-register webhooks after connecting
    this.converty.registerWebhooks(state).catch(() => {});

    return res.redirect(`${frontend}/stores?converty=connected`);
  }

  // --- Protected routes ---
  @UseGuards(JwtAuthGuard)
  @Get('converty/:storeId/auth-url')
  getAuthUrl(@Param('storeId') storeId: string) {
    return this.converty.getAuthUrl(storeId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('converty/:storeId/status')
  getStatus(@Param('storeId') storeId: string) {
    return this.converty.getStatus(storeId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('converty/:storeId/disconnect')
  disconnect(@Param('storeId') storeId: string) {
    return this.converty.disconnect(storeId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('converty/:storeId/import-products')
  importProducts(@Param('storeId') storeId: string) {
    return this.converty.importProducts(storeId);
  }
  @UseGuards(JwtAuthGuard)
  @Get('converty/:storeId/debug')
  debug(@Param('storeId') storeId: string, @Query('path') path: string) {
    return this.converty.debugRaw(storeId, path ?? '/stores/me');
  }
  @UseGuards(JwtAuthGuard)
  @Get('converty/:storeId/browse-products')
  browseProducts(
    @Param('storeId') storeId: string,
    @Query('search') search?: string,
  ) {
    return this.converty.browseProducts(storeId, search);
  }

  @UseGuards(JwtAuthGuard)
  @Post('converty/:storeId/import-selected')
  importSelected(
    @Param('storeId') storeId: string,
    @Body() body: { selections: any[] },
  ) {
    return this.converty.importSelectedProducts(storeId, body.selections ?? []);
  }
  @UseGuards(JwtAuthGuard)
  @Post('converty/:storeId/import-orders')
  importOrders(
    @Param('storeId') storeId: string,
    @Body() body: { limit?: number },
  ) {
    return this.converty.importOrders(storeId, body?.limit ?? 100);
  }

  @UseGuards(JwtAuthGuard)
  @Post('converty/:storeId/register-webhooks')
  registerWebhooks(@Param('storeId') storeId: string) {
    return this.converty.registerWebhooks(storeId);
  }
    // ---- Shopify ----

    @UseGuards(JwtAuthGuard)
    @Get('shopify/:storeId/status')
    shopifyStatus(@Param('storeId') storeId: string) {
      return this.shopify.getStatus(storeId);
    }
  
    @UseGuards(JwtAuthGuard)
    @Post('shopify/:storeId/test')
    shopifyTest(@Param('storeId') storeId: string) {
      return this.shopify.testConnection(storeId);
    }
  
    @UseGuards(JwtAuthGuard)
    @Get('shopify/:storeId/browse-products')
    shopifyBrowse(
      @Param('storeId') storeId: string,
      @Query('search') search?: string,
    ) {
      return this.shopify.browseProducts(storeId, search);
    }
  
    @UseGuards(JwtAuthGuard)
    @Post('shopify/:storeId/import-selected')
    shopifyImportSelected(
      @Param('storeId') storeId: string,
      @Body() body: { selections: any[] },
    ) {
      return this.shopify.importSelectedProducts(storeId, body.selections ?? []);
    }
    @UseGuards(JwtAuthGuard)
  @Post('shopify/:storeId/auth-url')
  shopifyAuthUrl(
    @Param('storeId') storeId: string,
    @Body() body: { shopDomain: string },
  ) {
    return this.shopify.getAuthUrl(storeId, body.shopDomain ?? '');
  }

  @Get('shopify/callback')
  @SetMetadata('isPublic', true)
  async shopifyCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('shop') shop: string,
    @Res() res: Response,
  ) {
    const frontend = process.env.FRONTEND_URL ?? 'https://orderly-beige.vercel.app';

    if (!code || !state) {
      return res.redirect(`${frontend}/stores?shopify=error`);
    }

    const result = await this.shopify.handleCallback(code, state, shop);
    if (!result.ok) {
      return res.redirect(`${frontend}/stores?shopify=error`);
    }

    this.shopify.registerWebhooks(result.storeId!).catch(() => {});

    return res.redirect(`${frontend}/stores?shopify=connected`);
  }

  @UseGuards(JwtAuthGuard)
  @Post('shopify/:storeId/register-webhooks')
  shopifyWebhooks(@Param('storeId') storeId: string) {
    return this.shopify.registerWebhooks(storeId);
  }
    @UseGuards(JwtAuthGuard)
    @Post('shopify/:storeId/import-all-products')
    shopifyImportAll(@Param('storeId') storeId: string) {
      return this.shopify.importAllProducts(storeId);
    }
}