import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: '3mb' });
  app.useBodyParser('urlencoded', { limit: '3mb', extended: true });

  // AllExceptionsFilter is registered via APP_FILTER in app.module.ts, not here —
  // it needs Nest's DI to hand it a real PrismaService (task 7.8).

  // Lets Nest run onModuleDestroy (and so Prisma's $disconnect) on SIGTERM.
  app.enableShutdownHooks();

  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN'),
    credentials: true,
  });

  const port = config.get<number>('PORT', 3000);

  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on http://localhost:${port}`);
}

void bootstrap();
