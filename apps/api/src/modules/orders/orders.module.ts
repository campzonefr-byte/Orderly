import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { BordereauService } from './bordereau.service';
import { DeliveryModule } from '../delivery/delivery.module';

@Module({
  imports: [DeliveryModule],
  providers: [OrdersService, BordereauService],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}