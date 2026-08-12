import { Module } from '@nestjs/common';
import { CosmosService } from './cosmos.service';
import { DeliveryController } from './delivery.controller';

@Module({
  providers: [CosmosService],
  controllers: [DeliveryController],
  exports: [CosmosService],
})
export class DeliveryModule {}