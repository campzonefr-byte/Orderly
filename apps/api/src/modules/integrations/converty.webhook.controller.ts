import { Controller, Post, Body, Param, SetMetadata } from '@nestjs/common';
import { ConvertyService } from './converty.service';

@Controller('webhooks/converty')
export class ConvertyWebhookController {
  constructor(private converty: ConvertyService) {}

  @Post(':storeId/order-create')
  @SetMetadata('isPublic', true)
  async orderCreate(@Param('storeId') storeId: string, @Body() payload: any) {
    const data = payload?.data ?? payload;
    return this.converty.handleWebhook(storeId, data);
  }

  @Post(':storeId/order-update')
  @SetMetadata('isPublic', true)
  async orderUpdate(@Param('storeId') storeId: string, @Body() payload: any) {
    const data = payload?.data ?? payload;
    return this.converty.handleWebhook(storeId, data);
  }
}