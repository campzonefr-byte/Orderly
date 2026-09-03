import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { EasySellSyncService } from './easysell-sync.service';

@Module({
  providers: [ProductsService, EasySellSyncService],
  controllers: [ProductsController],
  exports: [ProductsService, EasySellSyncService],
})
export class ProductsModule {}