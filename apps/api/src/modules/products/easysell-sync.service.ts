import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from './products.service';

@Injectable()
export class EasySellSyncService {
  private readonly logger = new Logger('EasySellSync');
  private running = false;

  constructor(
    private prisma: PrismaService,
    private products: ProductsService,
  ) {}

  // Every hour
  @Cron('0 0 * * * *')
  async handleCron() {
    if (this.running) {
      this.logger.warn('Sync deja en cours, on saute ce cycle');
      return;
    }
    this.running = true;

    try {
      const stores = await this.prisma.store.findMany({
        where: { sourceType: 'SHOPIFY', isActive: true },
        select: { id: true, name: true },
      });

      for (const store of stores) {
        try {
          const offers: any = await this.products.syncEasySellOffers(store.id);
          const bumps: any = await this.products.syncEasySellBumps(store.id);

          if (offers.ok || bumps.ok) {
            this.logger.log(
              `${store.name} — ${offers.created ?? 0} offres, ${bumps.created ?? 0} upsells`,
            );
          }
        } catch (e: any) {
          this.logger.warn(`${store.name} : ${e?.message}`);
        }
      }
    } catch (e: any) {
      this.logger.error(`Sync echouee: ${e?.message}`);
    } finally {
      this.running = false;
    }
  }

  async runNow(storeId?: string) {
    const stores = storeId
      ? await this.prisma.store.findMany({ where: { id: storeId } })
      : await this.prisma.store.findMany({
          where: { sourceType: 'SHOPIFY', isActive: true },
        });

    const results: any[] = [];
    for (const store of stores) {
      const offers: any = await this.products.syncEasySellOffers(store.id);
      const bumps: any = await this.products.syncEasySellBumps(store.id);
      results.push({
        store: store.name,
        offers: offers.created ?? 0,
        upsells: bumps.created ?? 0,
        errors: [offers.error, bumps.error].filter(Boolean),
      });
    }
    return { ok: true, results };
  }
}