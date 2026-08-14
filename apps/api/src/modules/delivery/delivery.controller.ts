import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { CosmosService } from './cosmos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CosmosSyncService } from './cosmos-sync.service';
import { Res, SetMetadata } from '@nestjs/common';
import type { Response } from 'express';

@UseGuards(JwtAuthGuard)
@Controller('delivery')
export class DeliveryController {
  constructor(
    private cosmos: CosmosService,
    private sync: CosmosSyncService,
  ) {}
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
  @Get('cosmos/:storeId/status')
  getStatus(@Param('storeId') storeId: string) {
    return this.cosmos.getStatus(storeId);
  }
  @Post('cosmos/sync-all')
  syncAll() {
    return this.sync.runNow();
  }
  @Post('cosmos/:storeId/config')
  saveConfig(
    @Param('storeId') storeId: string,
    @Body() body: { token: string },
  ) {
    return this.cosmos.saveConfig(storeId, body.token);
  }
  @Get('cosmos/cities')
  getCities() {
    return this.cosmos.getCities();
  }

  @Get('cosmos/label/:orderId')
  getLabel(@Param('orderId') orderId: string) {
    return this.cosmos.getLabelUrl(orderId);
  }

  @Post('cosmos/shipment/:orderId/delete')
  deleteShipment(@Param('orderId') orderId: string) {
    return this.cosmos.deleteShipment(orderId);
  }
  @Post('cosmos/:storeId/test')
  testConnection(@Param('storeId') storeId: string) {
    return this.cosmos.testConnection(storeId);
  }

  @Post('cosmos/shipment/:orderId')
  createShipment(@Param('orderId') orderId: string, @Request() req: any) {
    return this.cosmos.createShipment(orderId, req.user.id);
  }

  @Post('cosmos/:storeId/sync')
  syncStatuses(@Param('storeId') storeId: string) {
    return this.cosmos.syncStatuses(storeId);
  }

  @Get('cosmos/:storeId/track')
  track(@Param('storeId') storeId: string, @Query('barcode') barcode: string) {
    return this.cosmos.trackOrder(storeId, barcode);
  }
}