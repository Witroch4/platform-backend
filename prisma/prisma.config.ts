import { defineConfig } from 'prisma/config';

export default defineConfig({
  seed: 'tsx prisma/seed.ts',
  // Reduzir logs em produção
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['info', 'warn', 'error']
});