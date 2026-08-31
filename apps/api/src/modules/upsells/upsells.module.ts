import { Module } from '@nestjs/common';
import { UpsellsService } from './upsells.service';
import { UpsellsController } from './upsells.controller';

@Module({
  providers: [UpsellsService],
  controllers: [UpsellsController],
  exports: [UpsellsService],
})
export class UpsellsModule {}