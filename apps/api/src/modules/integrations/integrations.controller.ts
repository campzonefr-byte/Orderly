import { Controller, Get, Post, Body, Param, Query, Res, UseGuards, SetMetadata } from '@nestjs/common';
import type { Response } from 'express';
import { ConvertyService } from './converty.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('integrations')
export class IntegrationsController {
  constructor(private converty: ConvertyService) {}

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
}