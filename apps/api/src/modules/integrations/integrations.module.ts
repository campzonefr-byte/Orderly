import { Module } from '@nestjs/common';
import { ConvertyService } from './converty.service';
import { ShopifyService } from './shopify.service';
import { IntegrationsController } from './integrations.controller';
import { ConvertyWebhookController } from './converty.webhook.controller';

@Module({
  providers: [ConvertyService, ShopifyService],
  controllers: [IntegrationsController, ConvertyWebhookController],
  exports: [ConvertyService, ShopifyService],
})
export class IntegrationsModule {}