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
      const integrations = await this.prisma.deliveryIntegration.findMany({
        where: { provider: 'COSMOS', isActive: true },
        select: { storeId: true },
      });

      if (integrations.length === 0) return;

      let totalChecked = 0;
      let totalUpdated = 0;

      for (const i of integrations) {
        const r: any = await this.cosmos.syncStatuses(i.storeId);
        if (r?.ok) {
          totalChecked += r.checked ?? 0;
          totalUpdated += r.updated ?? 0;
        }
      }

      if (totalUpdated > 0) {
        this.logger.log(
          `Sync terminee — ${totalChecked} verifiees, ${totalUpdated} mises a jour`,
        );
      }
    } catch (e: any) {
      this.logger.error(`Sync echouee: ${e?.message}`);
    } finally {
      this.running = false;
    }
  }

  async runNow() {
    const integrations = await this.prisma.deliveryIntegration.findMany({
      where: { provider: 'COSMOS', isActive: true },
      select: { storeId: true },
    });

    const results: any[] = [];
    for (const i of integrations) {
      const r = await this.cosmos.syncStatuses(i.storeId);
      results.push({ storeId: i.storeId, ...r });
    }
    return { ok: true, results };
  }
}