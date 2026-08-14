import { Module } from '@nestjs/common';
import { CosmosService } from './cosmos.service';
import { CosmosSyncService } from './cosmos-sync.service';
import { DeliveryController } from './delivery.controller';

@Module({
  providers: [CosmosService, CosmosSyncService],
  controllers: [DeliveryController],
  exports: [CosmosService, CosmosSyncService],
})
export class DeliveryModule {}