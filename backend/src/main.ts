import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  (app as any).disable?.('x-powered-by');
  app.enableShutdownHooks();
  const puerto = Number(process.env.PORT ?? 4310);
  await app.listen(puerto, process.env.HOST ?? '0.0.0.0');
  console.log(`API de Seguimiento SGRED en el puerto ${puerto}`);
}
bootstrap();
