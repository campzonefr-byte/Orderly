import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CosmosService } from './cosmos.service';

@Injectable()
export class CosmosSyncService {
  private readonly logger = new Logger('CosmosSync');
  private running = false;

  constructor(
    private prisma: PrismaService,
    private cosmos: CosmosService,
  ) {}

  @Cron('0 */15 * * * *')
  async handleCron() {
    if (this.running) {
      this.logger.warn('Sync deja en cours, on saute ce cycle');
      return;
    }
    this.running = true;

    try {
      const links = await this.prisma.deliveryIntegrationStore.findMany({
        where: { integration: { provider: 'COSMOS', isActive: true } },
        select: { storeId: true },
      });

      if (links.length === 0) return;

      let totalChecked = 0;
      let totalUpdated = 0;

      for (const l of links) {
        const r: any = await this.cosmos.syncStatuses(l.storeId);
        if (r?.ok) {
          totalChecked += r.checked ?? 0;
          totalUpdated += r.updated ?? 0;
        }
      }

      if (totalUpdated > 0) {
        this.logger.log(`Sync terminee — ${totalChecked} verifiees, ${totalUpdated} mises a jour`);
      }
    } catch (e: any) {
      this.logger.error(`Sync echouee: ${e?.message}`);
    } finally {
      this.running = false;
    }
  }

  async runNow() {
    const links = await this.prisma.deliveryIntegrationStore.findMany({
      where: { integration: { provider: 'COSMOS', isActive: true } },
      select: { storeId: true },
    });

    const results: any[] = [];
    for (const l of links) {
      const r = await this.cosmos.syncStatuses(l.storeId);
      results.push({ storeId: l.storeId, ...r });
    }
    return { ok: true, results };
  }
}