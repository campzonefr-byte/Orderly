import { Module } from '@nestjs/common';
import { ConvertyService } from './converty.service';
import { IntegrationsController } from './integrations.controller';
import { ConvertyWebhookController } from './converty.webhook.controller';

@Module({
  providers: [ConvertyService],
  controllers: [IntegrationsController, ConvertyWebhookController],
  exports: [ConvertyService],
})
export class IntegrationsModule {}