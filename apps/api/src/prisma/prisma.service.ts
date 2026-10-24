import { Injectable, OnModuleDestroy, OnModuleInit, INestApplicationContext } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplicationContext): Promise<void> {
    this.$on('beforeExit' as never, async () => {
      await app.close();
    });
  }
}
