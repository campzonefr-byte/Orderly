import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaService } from './meta.service';

const GRAPH = 'https://graph.facebook.com/v21.0';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private meta: MetaService,
  ) {}

  async list(query: {
    storeIds?: string[];
    accountId?: string;
    status?: string;
    postId?: string;
    search?: string;
    onlyDetected?: boolean;
  }) {
    const where: any = {};

    if (query.accountId) {
      where.accountId = query.accountId;
    } else if (query.storeIds?.length) {
      where.account = { storeId: { in: query.storeIds } };
    }

    if (query.status && query.status !== 'all') where.status = query.status;
    if (query.postId) where.postId = query.postId;
    if (query.onlyDetected) where.confidence = { gte: 0.5 };

    if (query.search) {
      where.OR = [
        { message: { contains: query.search, mode: 'insensitive' } },
        { authorName: { contains: query.search, mode: 'insensitive' } },
        { detectedPhone: { contains: query.search } },
      ];
    }

    const comments = await this.prisma.socialComment.findMany({
      where,
      include: {
        account: {
          select: { id: true, name: true, platform: true, pictureUrl: true, storeId: true },
        },
      },
      orderBy: { postedAt: 'desc' },
      take: 300,
    });

    // Attach linked orders
    const orderIds = comments.map((c) => c.orderId).filter(Boolean) as string[];
    const orders = orderIds.length
      ? await this.prisma.order.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, orderNumber: true, orderStatus: true, total: true },
        })
      : [];
    const orderMap = Object.fromEntries(orders.map((o) => [o.id, o]));

    return comments.map((c) => ({
      ...c,
      order: c.orderId ? orderMap[c.orderId] ?? null : null,
    }));
  }

  async summary(storeIds?: string[]) {
    const where: any = {};
    if (storeIds?.length) where.account = { storeId: { in: storeIds } };

    const [total, isNew, converted, ignored, detected] = await Promise.all([
      this.prisma.socialComment.count({ where }),
      this.prisma.socialComment.count({ where: { ...where, status: 'NEW' } }),
      this.prisma.socialComment.count({ where: { ...where, status: 'CONVERTED' } }),
      this.prisma.socialComment.count({ where: { ...where, status: 'IGNORED' } }),
      this.prisma.socialComment.count({
        where: { ...where, confidence: { gte: 0.5 } },
      }),
    ]);

    return {
      total,
      new: isNew,
      converted,
      ignored,
      detected,
      conversionRate: detected > 0 ? Math.round((converted / detected) * 100) : 0,
    };
  }

  async byPost(storeIds?: string[]) {
    const where: any = {};
    if (storeIds?.length) where.account = { storeId: { in: storeIds } };

    const comments = await this.prisma.socialComment.findMany({
      where,
      select: {
        postId: true,
        postMessage: true,
        postPictureUrl: true,
        postType: true,
        status: true,
        confidence: true,
        orderId: true,
        account: { select: { name: true, platform: true } },
      },
    });

    const byPost: Record<string, any> = {};

    for (const c of comments) {
      if (!byPost[c.postId]) {
        byPost[c.postId] = {
          postId: c.postId,
          message: c.postMessage,
          picture: c.postPictureUrl,
          type: c.postType,
          accountName: c.account.name,
          platform: c.account.platform,
          comments: 0,
          detected: 0,
          converted: 0,
          orderIds: [] as string[],
        };
      }
      const p = byPost[c.postId];
      p.comments++;
      if (c.confidence >= 0.5) p.detected++;
      if (c.status === 'CONVERTED') {
        p.converted++;
        if (c.orderId) p.orderIds.push(c.orderId);
      }
    }

    const posts = Object.values(byPost);

    // Revenue per post
    for (const p of posts as any[]) {
      if (p.orderIds.length === 0) {
        p.revenue = 0;
        continue;
      }
      const orders = await this.prisma.order.findMany({
        where: { id: { in: p.orderIds }, orderStatus: { in: ['LIVRE', 'PAYE'] } },
        select: { total: true },
      });
      p.revenue = orders.reduce((s, o) => s + Number(o.total), 0);
      p.conversionRate =
        p.detected > 0 ? Math.round((p.converted / p.detected) * 100) : 0;
      delete p.orderIds;
    }

    return (posts as any[]).sort((a, b) => b.comments - a.comments);
  }

  async updateStatus(id: string, status: string, actorId: string) {
    return this.prisma.socialComment.update({
      where: { id },
      data: {
        status,
        ...(status === 'REVIEWED' && { assignedTo: actorId }),
      },
    });
  }

  async addNote(id: string, note: string) {
    return this.prisma.socialComment.update({
      where: { id },
      data: { internalNote: note },
    });
  }

  async reply(id: string, text: string) {
    const comment = await this.prisma.socialComment.findUnique({
      where: { id },
      include: { account: true },
    });
    if (!comment) return { ok: false, error: 'Commentaire introuvable' };

    try {
      const res = await fetch(`${GRAPH}/${comment.externalId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          access_token: comment.account.accessToken,
        }),
      });
      const data: any = await res.json();

      if (!res.ok) {
        return { ok: false, error: data?.error?.message ?? `HTTP ${res.status}` };
      }

      await this.prisma.socialComment.update({
        where: { id },
        data: { repliedAt: new Date(), replyText: text },
      });

      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Erreur reseau' };
    }
  }

  async convertToOrder(
    id: string,
    data: {
      customerName: string;
      customerPhone: string;
      customerPhone2?: string;
      city: string;
      address: string;
      deliveryCompany?: string;
      lineItems: { title: string; sku?: string; quantity: number; price: number }[];
    },
    actorId: string,
  ) {
    const comment = await this.prisma.socialComment.findUnique({
      where: { id },
      include: { account: true },
    });
    if (!comment) return { ok: false, error: 'Commentaire introuvable' };

    const total = data.lineItems.reduce((s, li) => s + li.price * li.quantity, 0);
    const platform = comment.account.platform === 'INSTAGRAM' ? 'Instagram' : 'Facebook';

    let agentName: string | null = null;
    if (actorId) {
      const user = await this.prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true },
      });
      agentName = user?.name ?? null;
    }

    const order = await this.prisma.order.create({
      data: {
        storeId: comment.account.storeId,
        externalOrderId: `social_${comment.externalId}`,
        orderNumber: `#S${Date.now().toString().slice(-6)}`,
        orderStatus: 'NOUVEAU',
        financialStatus: 'PENDING',
        fulfillmentStatus: 'UNFULFILLED',
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerPhone2: data.customerPhone2 ?? null,
        shippingAddress: { city: data.city, address1: data.address },
        currency: 'TND',
        subtotal: total,
        taxTotal: 0,
        shippingTotal: 0,
        total,
        totalRefunded: 0,
        tags: [platform, comment.postType === 'AD' ? 'Publicite' : 'Publication'],
        internalNote: `Commentaire ${platform} de ${comment.authorName} : "${comment.message.slice(0, 200)}"`,
        deliveryCompany: data.deliveryCompany ?? null,
        assignedAgentId: actorId,
        assignedAgentName: agentName,
        sourceCreatedAt: new Date(),
        lineItems: {
          create: data.lineItems.map((li) => ({
            title: li.title,
            sku: li.sku ?? null,
            quantity: li.quantity,
            price: li.price,
            fulfilledQty: 0,
            refundedQty: 0,
          })),
        },
      },
    });

    await this.prisma.socialComment.update({
      where: { id },
      data: { status: 'CONVERTED', orderId: order.id },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId: order.id,
        eventType: 'order_created_from_comment',
        payload: {
          platform,
          postId: comment.postId,
          commentId: comment.externalId,
          author: comment.authorName,
        },
        actor: actorId,
      },
    });

    return { ok: true, order };
  }

  // Manual sync when webhooks are not available
  async syncAccount(accountId: string, limit = 50) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) return { ok: false, error: 'Compte introuvable' };

    try {
      const isIg = account.platform === 'INSTAGRAM';
      const edge = isIg ? 'media' : 'posts';
      const fields = isIg
        ? 'id,caption,media_url,timestamp,comments{id,text,username,timestamp,from}'
        : 'id,message,full_picture,created_time,comments.limit(50){id,message,from,created_time,parent}';

      const res = await fetch(
        `${GRAPH}/${account.externalId}/${edge}?fields=${fields}&limit=${limit}&access_token=${account.accessToken}`,
      );
      const data: any = await res.json();

      if (!res.ok) {
        return { ok: false, error: data?.error?.message ?? `HTTP ${res.status}` };
      }

      const posts: any[] = data?.data ?? [];
      let imported = 0;

      for (const post of posts) {
        const comments: any[] = post.comments?.data ?? [];
        for (const c of comments) {
          const r = await this.meta.saveComment(account.id, {
            id: c.id,
            parent_id: c.parent?.id,
            post_id: post.id,
            message: c.text ?? c.message,
            from: c.from ?? { name: c.username },
            created_time: c.timestamp ?? c.created_time,
            post: {
              message: post.caption ?? post.message,
              picture: post.media_url ?? post.full_picture,
            },
          });
          if (r.ok && !r.skipped) imported++;
        }
      }

      return { ok: true, posts: posts.length, imported };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Erreur reseau' };
    }
  }
}