/**
 * Centralized mocks for external dependencies
 * Fixes connection issues and provides consistent mocking
 */

import { testRedisConfig, createMockRedisConnection } from './test-redis-config';

// Redis Mock
jest.mock('@/lib/redis', () => ({
  connection: createMockRedisConnection(),
  config: testRedisConfig,
}));

// Prisma Mock
const mockPrisma = {
  chatwitInbox: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  mapeamentoIntencao: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  mapeamentoBotao: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  lead: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  template: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

// NextAuth Mock
jest.mock('next-auth', () => ({
  default: jest.fn(),
  getServerSession: jest.fn(),
}));

jest.mock('next-auth/next', () => ({
  NextAuthHandler: jest.fn(),
}));

// Next.js Router Mock
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    query: {},
    pathname: '/',
    asPath: '/',
  }),
}));

// Next.js Navigation Mock (App Router)
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// WhatsApp API Mock
const mockWhatsAppAPI = {
  sendMessage: jest.fn().mockResolvedValue({ 
    messageId: 'msg-123',
    status: 'sent',
    timestamp: Date.now(),
  }),
  sendReaction: jest.fn().mockResolvedValue({ 
    success: true,
    messageId: 'reaction-123',
  }),
  sendTemplate: jest.fn().mockResolvedValue({
    messageId: 'template-123',
    status: 'sent',
  }),
  getMessageStatus: jest.fn().mockResolvedValue({
    status: 'delivered',
    timestamp: Date.now(),
  }),
};

jest.mock('@/lib/whatsapp', () => mockWhatsAppAPI);

// BullMQ Mock
const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-123' }),
  process: jest.fn(),
  getJob: jest.fn(),
  getJobs: jest.fn().mockResolvedValue([]),
  getWaiting: jest.fn().mockResolvedValue([]),
  getActive: jest.fn().mockResolvedValue([]),
  getCompleted: jest.fn().mockResolvedValue([]),
  getFailed: jest.fn().mockResolvedValue([]),
  getDelayed: jest.fn().mockResolvedValue([]),
  clean: jest.fn().mockResolvedValue(0),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockWorker = {
  on: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => mockQueue),
  Worker: jest.fn().mockImplementation(() => mockWorker),
  Job: jest.fn(),
}));

// Export mocks for use in tests
export {
  mockPrisma,
  mockWhatsAppAPI,
  mockQueue,
  mockWorker,
  testRedisConfig,
};