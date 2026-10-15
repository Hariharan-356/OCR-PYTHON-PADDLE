import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { ClaimsService } from './claims.service';
import { ClaimsController } from './claims.controller';
import { OcrService } from './ocr.service';

@Module({
  imports: [],
  controllers: [ClaimsController],
  providers: [DatabaseService, ClaimsService, OcrService],
})
export class AppModule {}
