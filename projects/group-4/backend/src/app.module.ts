import { Module } from '@nestjs/common';
import { DataService } from './data/data.service';
import { LoansController } from './loans/loans.controller';
import { LoansService } from './loans/loans.service';

@Module({
  controllers: [LoansController],
  providers: [DataService, LoansService],
})
export class AppModule {}
