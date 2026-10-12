import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { ClaimsService } from './claims.service';
import { ClaimsController } from './claims.controller';

@Module({
  imports: [],
  controllers: [ClaimsController],
  providers: [DatabaseService, ClaimsService],
})
export class AppModule {}
