import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { BordereauService } from './bordereau.service';
import { DeliveryModule } from '../delivery/delivery.module';
import { BundlesModule } from '../bundles/bundles.module';

@Module({
  imports: [DeliveryModule, BundlesModule],
  providers: [OrdersService, BordereauService],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}