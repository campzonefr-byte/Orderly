import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { OrdersModule } from './modules/orders/orders.module';
import { StoresModule } from './modules/stores/stores.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { ChatModule } from './modules/chat/chat.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { ProductsModule } from './modules/products/products.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SocialModule } from './modules/social/social.module';
import { BundlesModule } from './modules/bundles/bundles.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { UpsellsModule } from './modules/upsells/upsells.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    OrdersModule,
    StoresModule,
    UsersModule,
    WebhooksModule,
    NotificationsModule,
    MarketingModule,
    ChatModule,
    DeliveryModule,
    IntegrationsModule,
    ProductsModule,
    SocialModule,
    BundlesModule,
    ShippingModule,
    UpsellsModule,
  ],
})
export class AppModule {}