import { Module } from '@nestjs/common';
import { MetaService } from './meta.service';
import { CommentsService } from './comments.service';
import { SocialController } from './social.controller';

@Module({
  providers: [MetaService, CommentsService],
  controllers: [SocialController],
  exports: [MetaService, CommentsService],
})
export class SocialModule {}