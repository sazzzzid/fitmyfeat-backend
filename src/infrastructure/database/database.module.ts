import { Global, Module } from '@nestjs/common';
import { PlatformSeedService } from './platform-seed.service.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService, PlatformSeedService],
  exports: [PrismaService, PlatformSeedService],
})
export class DatabaseModule {}
