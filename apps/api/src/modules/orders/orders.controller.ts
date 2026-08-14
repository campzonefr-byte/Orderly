import { Controller, Get, Patch, Post, Body, Param, Query, UseGuards, Request, Res, SetMetadata } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrderStatus } from '@prisma/client';
import type { Response } from 'express';
import { BordereauService } from './bordereau.service';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private orders: OrdersService,
    private bordereau: BordereauService,
  ) {}

  @Get()
  findAll(
    @Query('storeIds') storeIds?: string,
    @Query('orderStatus') orderStatus?: string,
    @Query('financialStatus') financialStatus?: string,
    @Query('fulfillmentStatus') fulfillmentStatus?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.orders.findAll({
      storeIds: storeIds ? storeIds.split(',') : undefined,
      orderStatus: orderStatus ? (orderStatus.split(',') as any) : undefined,
      financialStatus: financialStatus ? (financialStatus.split(',') as any) : undefined,
      fulfillmentStatus: fulfillmentStatus ? (fulfillmentStatus.split(',') as any) : undefined,
      search,
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 25,
    });
  }

  @Get(':id/bordereau')
  @SetMetadata('isPublic', true)
  async getBordereau(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const html = await this.bordereau.generateBordereau(id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Post('manual')
  createManual(
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.orders.createManual(body, req.user.id);
  }

  @Post('detect-from-message')
  detectFromMessage(
    @Body() body: { messages: string },
  ) {
    return this.orders.detectFromMessage(body.messages);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orders.findOne(id);
  }

  @Patch(':id')
  updateOrder(
    @Param('id') id: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.orders.updateOrder(id, body, req.user.id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: OrderStatus; reason?: string; note?: string },
    @Request() req: any,
  ) {
    return this.orders.updateStatus(id, body.status, req.user.id, {
      reason: body.reason,
      note: body.note,
    });
  }

  @Patch(':id/call-attempts')
  updateCallAttempts(
    @Param('id') id: string,
    @Body() body: { callAttempts: any[] },
  ) {
    return this.orders.updateCallAttempts(id, body.callAttempts);
  }

  @Patch(':id/tags')
  updateTags(
    @Param('id') id: string,
    @Body() body: { tags: string[] },
    @Request() req: any,
  ) {
    return this.orders.updateTags(id, body.tags, req.user.id);
  }

  @Patch('bulk/status')
  bulkStatus(
    @Body() body: { orderIds: string[]; status: OrderStatus },
    @Request() req: any,
  ) {
    return this.orders.bulkUpdateStatus(body.orderIds, body.status, req.user.id);
  }
  @Post('detect-loyal-customers')
detectLoyal() {
  return this.orders.detectLoyalCustomers();
}
@Post(':id/exchange')
createExchange(
  @Param('id') id: string,
  @Body() body: any,
  @Request() req: any,
) {
  return this.orders.createExchange(id, body, req.user.id);
}

@Post(':id/restock-exchange')
restockExchange(
  @Param('id') id: string,
  @Request() req: any,
) {
  return this.orders.restockExchangeItems(id, req.user.id);
}
@Get('stats/agents')
getAgentStats(
  @Query('from') from?: string,
  @Query('to') to?: string,
  @Query('storeIds') storeIds?: string,
) {
  return this.orders.getAgentStats({
    from,
    to,
    storeIds: storeIds ? storeIds.split(',') : undefined,
  });
}
@Get('stats/customers')
getCustomers(
  @Query('storeIds') storeIds?: string,
  @Query('search') search?: string,
) {
  return this.orders.getCustomers({
    storeIds: storeIds ? storeIds.split(',') : undefined,
    search,
  });
}
@Get('stats/dashboard')
  getDashboard(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('storeIds') storeIds?: string,
  ) {
    return this.orders.getDashboard({
      from,
      to,
      storeIds: storeIds ? storeIds.split(',') : undefined,
    });
  }
  @Post(':id/prepare-print')
  prepareForPrint(@Param('id') id: string, @Request() req: any) {
    return this.orders.prepareForPrint(id, req.user.id);
  }
  @Get(':id/events')
  getEvents(@Param('id') id: string) {
    return this.orders.getOrderEvents(id);
  }
  
  @Post(':id/refund')
  refund(
    @Param('id') id: string,
    @Body() body: { amount: number; reason?: string },
    @Request() req: any,
  ) {
    return this.orders.refund(id, body.amount, body.reason ?? '', req.user.id);
  }
}