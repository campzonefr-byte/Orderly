import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Res, UseGuards, Request,
} from '@nestjs/common';
import type { Response } from 'express';
import { CosmosService } from './cosmos.service';
import { CosmosSyncService } from './cosmos-sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('delivery')
export class DeliveryController {
  constructor(
    private cosmos: CosmosService,
    private sync: CosmosSyncService,
  ) {}

  // ---- Integrations ----

  @Get('integrations')
  listIntegrations() {
    return this.cosmos.listIntegrations();
  }

  @Post('integrations')
  createIntegration(@Body() body: { name: string; token: string }) {
    return this.cosmos.createIntegration(body.name ?? 'Cosmos', body.token ?? '');
  }

  @Delete('integrations/:id')
  deleteIntegration(@Param('id') id: string) {
    return this.cosmos.deleteIntegration(id);
  }

  @Patch('integrations/:id/token')
  updateToken(@Param('id') id: string, @Body() body: { token: string }) {
    return this.cosmos.updateToken(id, body.token ?? '');
  }

  @Post('integrations/:id/test')
  testById(@Param('id') id: string) {
    return this.cosmos.testConnectionById(id);
  }

  @Post('integrations/:id/link/:storeId')
  linkStore(@Param('id') id: string, @Param('storeId') storeId: string) {
    return this.cosmos.linkStore(id, storeId);
  }

  @Delete('integrations/:id/link/:storeId')
  unlinkStore(@Param('id') id: string, @Param('storeId') storeId: string) {
    return this.cosmos.unlinkStore(id, storeId);
  }

  // ---- Sync ----

  @Post('cosmos/sync-all')
  syncAll() {
    return this.sync.runNow();
  }

  // ---- Labels ----

  @Get('cosmos/cities')
  getCities() {
    return this.cosmos.getCities();
  }

  @Get('cosmos/label/:orderId')
  getLabel(@Param('orderId') orderId: string) {
    return this.cosmos.getLabelUrl(orderId);
  }

  @Get('cosmos/:storeId/label')
  @SetMetadata('isPublic', true)
  async serveLabel(
    @Param('storeId') storeId: string,
    @Query('barcode') barcode: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const fmt = format === 'html' ? 'html' : 'pdf';
    const result: any = await this.cosmos.fetchLabel(storeId, barcode, fmt);

    if (!result.ok) {
      res.status(502).send(`Erreur bordereau Cosmos : ${result.error}`);
      return;
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `inline; filename="label-${barcode}.${fmt}"`);
    res.send(result.buffer);
  }

  // ---- Shipments ----

  @Post('cosmos/shipment/:orderId/delete')
  deleteShipment(@Param('orderId') orderId: string) {
    return this.cosmos.deleteShipment(orderId);
  }
}