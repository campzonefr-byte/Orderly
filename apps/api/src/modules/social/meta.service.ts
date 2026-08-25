import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const GRAPH = 'https://graph.facebook.com/v21.0';

const TUNISIAN_CITIES = [
  'Ariana', 'Ben Arous', 'Bizerte', 'Beja', 'Gabes', 'Gafsa',
  'Jendouba', 'Kairouan', 'Kasserine', 'Kebili', 'Kef', 'Mahdia',
  'Manouba', 'Medenine', 'Monastir', 'Nabeul', 'Sfax', 'Sidi Bouzid',
  'Siliana', 'Sousse', 'Tataouine', 'Tozeur', 'Tunis', 'Zaghouan',
  'La Marsa', 'Hammamet', 'Djerba', 'Sahline', 'Msaken', 'Kelibia',
];

const BUY_INTENT = [
  'commande', 'commander', 'je veux', 'je prend', 'je prends',
  'combien', 'prix', 'disponible', 'dispo', 'interesse', 'interessee',
  'livraison', 'livrer', 'نحب', 'بش ناخذ', 'قداش', 'كم', 'موجود',
  'نشري', 'عندكم', 'توصيل',
];

@Injectable()
export class MetaService {
  constructor(private prisma: PrismaService) {}

  private get appId() {
    return process.env.META_APP_ID ?? '';
  }
  private get appSecret() {
    return process.env.META_APP_SECRET ?? '';
  }
  private get redirectUri() {
    return process.env.META_REDIRECT_URI ?? '';
  }
  get verifyToken() {
    return process.env.META_VERIFY_TOKEN ?? 'orderly-verify';
  }

  isConfigured() {
    return !!this.appId && !!this.appSecret;
  }

  getAuthUrl(storeId: string) {
    if (!this.isConfigured()) {
      return { ok: false, error: 'Meta App non configuree sur le serveur' };
    }

    const scopes = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_engagement',
      'pages_manage_metadata',
      'pages_messaging',
      'instagram_basic',
      'instagram_manage_comments',
      'instagram_manage_messages',
      'business_management',
    ].join(',');

    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      scope: scopes,
      response_type: 'code',
      state: storeId,
    });

    return {
      ok: true,
      url: `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`,
    };
  }

  async handleCallback(code: string, storeId: string) {
    try {
      // Short-lived user token
      const tokenRes = await fetch(
        `${GRAPH}/oauth/access_token?` +
          new URLSearchParams({
            client_id: this.appId,
            client_secret: this.appSecret,
            redirect_uri: this.redirectUri,
            code,
          }),
      );
      const tokenData: any = await tokenRes.json();
      if (!tokenRes.ok || !tokenData?.access_token) {
        return { ok: false, error: tokenData?.error?.message ?? 'Echange du code echoue' };
      }

      // Long-lived user token
      const longRes = await fetch(
        `${GRAPH}/oauth/access_token?` +
          new URLSearchParams({
            grant_type: 'fb_exchange_token',
            client_id: this.appId,
            client_secret: this.appSecret,
            fb_exchange_token: tokenData.access_token,
          }),
      );
      const longData: any = await longRes.json();
      const userToken = longData?.access_token ?? tokenData.access_token;

      // Pages
      const pagesRes = await fetch(
        `${GRAPH}/me/accounts?fields=id,name,username,picture,access_token,instagram_business_account{id,name,username,profile_picture_url}&access_token=${userToken}`,
      );
      const pagesData: any = await pagesRes.json();
      if (!pagesRes.ok) {
        return { ok: false, error: pagesData?.error?.message ?? 'Recuperation des pages echouee' };
      }

      const pages: any[] = pagesData?.data ?? [];
      let saved = 0;

      for (const p of pages) {
        await this.upsertAccount({
          storeId,
          platform: 'FACEBOOK',
          externalId: String(p.id),
          name: p.name ?? 'Page',
          username: p.username ?? null,
          pictureUrl: p.picture?.data?.url ?? null,
          accessToken: p.access_token,
        });
        saved++;

        const ig = p.instagram_business_account;
        if (ig?.id) {
          await this.upsertAccount({
            storeId,
            platform: 'INSTAGRAM',
            externalId: String(ig.id),
            name: ig.name ?? ig.username ?? 'Instagram',
            username: ig.username ?? null,
            pictureUrl: ig.profile_picture_url ?? null,
            accessToken: p.access_token,
          });
          saved++;
        }
      }

      return { ok: true, saved, pages: pages.length };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Erreur reseau' };
    }
  }

  private async upsertAccount(data: {
    storeId: string;
    platform: string;
    externalId: string;
    name: string;
    username: string | null;
    pictureUrl: string | null;
    accessToken: string;
  }) {
    const existing = await this.prisma.socialAccount.findFirst({
      where: {
        storeId: data.storeId,
        platform: data.platform,
        externalId: data.externalId,
      },
    });

    if (existing) {
      return this.prisma.socialAccount.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          username: data.username,
          pictureUrl: data.pictureUrl,
          accessToken: data.accessToken,
          isActive: true,
        },
      });
    }

    return this.prisma.socialAccount.create({ data });
  }

  async listAccounts(storeIds?: string[]) {
    const where: any = {};
    if (storeIds?.length) where.storeId = { in: storeIds };

    const accounts = await this.prisma.socialAccount.findMany({
      where,
      include: { store: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      accounts.map(async (a) => ({
        id: a.id,
        platform: a.platform,
        externalId: a.externalId,
        name: a.name,
        username: a.username,
        pictureUrl: a.pictureUrl,
        isActive: a.isActive,
        storeId: a.storeId,
        storeName: a.store.name,
        commentCount: await this.prisma.socialComment.count({
          where: { accountId: a.id },
        }),
        newCount: await this.prisma.socialComment.count({
          where: { accountId: a.id, status: 'NEW' },
        }),
      })),
    );
  }

  async disconnectAccount(id: string) {
    await this.prisma.socialAccount.update({
      where: { id },
      data: { isActive: false },
    });
    return { ok: true };
  }

  // ---------- Comment detection ----------

  detectOrderInfo(message: string) {
    const text = message ?? '';
    const lower = text.toLowerCase();

    // Tunisian phone: 8 digits starting with 2,4,5,9 — with or without +216
    const phoneMatch = text.match(
      /(?:\+?216[\s.-]?)?([2459]\d)[\s.-]?(\d{3})[\s.-]?(\d{3})/,
    );
    const detectedPhone = phoneMatch
      ? phoneMatch[0].replace(/[\s.-]/g, '').replace(/^\+?216/, '')
      : null;

    // City
    const detectedCity =
      TUNISIAN_CITIES.find((c) =>
        lower.includes(c.toLowerCase().replace(/[éèê]/g, 'e')),
      ) ?? null;

    // Name: two capitalized words, avoiding city names
    let detectedName: string | null = null;
    const nameMatch = text.match(
      /\b([A-ZÀ-Ý][a-zà-ÿ]{2,})\s+([A-ZÀ-Ý][a-zà-ÿ]{2,})\b/,
    );
    if (nameMatch) {
      const candidate = nameMatch[0];
      const isCity = TUNISIAN_CITIES.some(
        (c) => c.toLowerCase() === candidate.toLowerCase(),
      );
      if (!isCity) detectedName = candidate;
    }

    const hasIntent = BUY_INTENT.some((k) => lower.includes(k));

    let confidence = 0;
    if (detectedPhone) confidence += 0.5;
    if (detectedName) confidence += 0.2;
    if (detectedCity) confidence += 0.2;
    if (hasIntent) confidence += 0.1;

    return {
      detectedPhone,
      detectedName,
      detectedCity,
      detectedProduct: null,
      confidence: Math.min(1, confidence),
      hasIntent,
    };
  }

  async saveComment(accountId: string, payload: any) {
    const externalId = String(payload.id ?? payload.comment_id ?? '');
    if (!externalId) return { ok: false };

    const existing = await this.prisma.socialComment.findUnique({
      where: { externalId },
    });
    if (existing) return { ok: true, skipped: true };

    const message = String(payload.message ?? payload.text ?? '');
    const detection = this.detectOrderInfo(message);

    const comment = await this.prisma.socialComment.create({
      data: {
        accountId,
        externalId,
        parentId: payload.parent_id ? String(payload.parent_id) : null,
        postId: String(payload.post_id ?? payload.media_id ?? ''),
        postMessage: payload.post?.message ?? null,
        postPictureUrl: payload.post?.picture ?? payload.media?.media_url ?? null,
        postType: payload.is_ad ? 'AD' : 'POST',
        authorId: payload.from?.id ? String(payload.from.id) : null,
        authorName: payload.from?.name ?? payload.from?.username ?? 'Inconnu',
        authorPicture: payload.from?.picture?.data?.url ?? null,
        message,
        detectedPhone: detection.detectedPhone,
        detectedName: detection.detectedName ?? payload.from?.name ?? null,
        detectedCity: detection.detectedCity,
        confidence: detection.confidence,
        status: 'NEW',
        postedAt: payload.created_time
          ? new Date(payload.created_time)
          : new Date(),
      },
    });

    return { ok: true, comment };
  }

  async handleWebhook(body: any) {
    const entries: any[] = body?.entry ?? [];
    let processed = 0;

    for (const entry of entries) {
      const pageId = String(entry.id ?? '');
      const account = await this.prisma.socialAccount.findFirst({
        where: { externalId: pageId, isActive: true },
      });
      if (!account) continue;

      const changes: any[] = entry.changes ?? [];
      for (const change of changes) {
        if (change.field !== 'feed' && change.field !== 'comments') continue;
        const v = change.value ?? {};
        if (v.item && v.item !== 'comment') continue;
        if (v.verb && v.verb !== 'add') continue;

        await this.saveComment(account.id, {
          id: v.comment_id ?? v.id,
          parent_id: v.parent_id,
          post_id: v.post_id ?? v.media_id,
          message: v.message ?? v.text,
          from: v.from,
          created_time: v.created_time
            ? new Date(Number(v.created_time) * 1000).toISOString()
            : undefined,
        });
        processed++;
      }
    }

    return { ok: true, processed };
  }
}