import {
    Controller, Get, Post, Patch, Body, Param, Query,
    Res, Req, UseGuards, Request, SetMetadata,
  } from '@nestjs/common';
  import type { Response } from 'express';
  import { MetaService } from './meta.service';
  import { CommentsService } from './comments.service';
  import { JwtAuthGuard } from '../auth/jwt-auth.guard';
  
  @Controller('social')
  export class SocialController {
    constructor(
      private meta: MetaService,
      private comments: CommentsService,
    ) {}
  
    // ---- Webhook verification (called by Meta) ----
  
    @Get('webhook')
    @SetMetadata('isPublic', true)
    verifyWebhook(
      @Query('hub.mode') mode: string,
      @Query('hub.verify_token') token: string,
      @Query('hub.challenge') challenge: string,
      @Res() res: Response,
    ) {
      if (mode === 'subscribe' && token === this.meta.verifyToken) {
        return res.status(200).send(challenge);
      }
      return res.status(403).send('Forbidden');
    }
  
    @Post('webhook')
    @SetMetadata('isPublic', true)
    async receiveWebhook(@Body() body: any, @Res() res: Response) {
      res.status(200).send('EVENT_RECEIVED');
      this.meta.handleWebhook(body).catch(() => {});
    }
  
    // ---- OAuth callback ----
  
    @Get('callback')
    @SetMetadata('isPublic', true)
    async callback(
      @Query('code') code: string,
      @Query('state') state: string,
      @Query('error') error: string,
      @Res() res: Response,
    ) {
      const frontend = process.env.FRONTEND_URL ?? 'https://orderly-beige.vercel.app';
  
      if (error || !code || !state) {
        return res.redirect(`${frontend}/comments?meta=error`);
      }
  
      const result: any = await this.meta.handleCallback(code, state);
      if (!result.ok) {
        const reason = encodeURIComponent(String(result.error ?? '').slice(0, 120));
        return res.redirect(`${frontend}/comments?meta=error&reason=${reason}`);
      }
  
      return res.redirect(`${frontend}/comments?meta=connected&saved=${result.saved}`);
    }
  
    // ---- Accounts ----
  
    @UseGuards(JwtAuthGuard)
    @Get('config')
    config() {
      return { configured: this.meta.isConfigured() };
    }
  
    @UseGuards(JwtAuthGuard)
    @Get('accounts')
    listAccounts(@Query('storeIds') storeIds?: string) {
      return this.meta.listAccounts(storeIds ? storeIds.split(',') : undefined);
    }
  
    @UseGuards(JwtAuthGuard)
    @Get('auth-url/:storeId')
    authUrl(@Param('storeId') storeId: string) {
      return this.meta.getAuthUrl(storeId);
    }
  
    @UseGuards(JwtAuthGuard)
    @Post('accounts/:id/disconnect')
    disconnect(@Param('id') id: string) {
      return this.meta.disconnectAccount(id);
    }
  
    @UseGuards(JwtAuthGuard)
    @Post('accounts/:id/sync')
    sync(@Param('id') id: string) {
      return this.comments.syncAccount(id);
    }
  
    // ---- Comments ----
  
    @UseGuards(JwtAuthGuard)
    @Get('comments')
    listComments(
      @Query('storeIds') storeIds?: string,
      @Query('accountId') accountId?: string,
      @Query('status') status?: string,
      @Query('postId') postId?: string,
      @Query('search') search?: string,
      @Query('onlyDetected') onlyDetected?: string,
    ) {
      return this.comments.list({
        storeIds: storeIds ? storeIds.split(',') : undefined,
        accountId,
        status,
        postId,
        search,
        onlyDetected: onlyDetected === 'true',
      });
    }
  
    @UseGuards(JwtAuthGuard)
    @Get('comments/summary')
    summary(@Query('storeIds') storeIds?: string) {
      return this.comments.summary(storeIds ? storeIds.split(',') : undefined);
    }
  
    @UseGuards(JwtAuthGuard)
    @Get('posts')
    byPost(@Query('storeIds') storeIds?: string) {
      return this.comments.byPost(storeIds ? storeIds.split(',') : undefined);
    }
  
    @UseGuards(JwtAuthGuard)
    @Patch('comments/:id/status')
    updateStatus(
      @Param('id') id: string,
      @Body() body: { status: string },
      @Request() req: any,
    ) {
      return this.comments.updateStatus(id, body.status, req.user.id);
    }
  
    @UseGuards(JwtAuthGuard)
    @Patch('comments/:id/note')
    addNote(@Param('id') id: string, @Body() body: { note: string }) {
      return this.comments.addNote(id, body.note ?? '');
    }
  
    @UseGuards(JwtAuthGuard)
    @Post('comments/:id/reply')
    reply(@Param('id') id: string, @Body() body: { text: string }) {
      return this.comments.reply(id, body.text ?? '');
    }
  
    @UseGuards(JwtAuthGuard)
    @Post('comments/:id/convert')
    convert(
      @Param('id') id: string,
      @Body() body: any,
      @Request() req: any,
    ) {
      return this.comments.convertToOrder(id, body, req.user.id);
    }
  }