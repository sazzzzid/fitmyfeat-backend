import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PlatformExceptionFilter } from './common/filters/platform-exception.filter.js';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  app.enableCors({
    origin: config.get<string>('frontendOrigin'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new PlatformExceptionFilter());
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
