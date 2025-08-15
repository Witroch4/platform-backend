// Using global jest from jest.config.js
import { NextRequest } from 'next/server';
import { PrismaClient, Provider, Unit, EventStatus } from '@prisma/client';
import { getPrismaInstance } from '@/lib/connections';
import { auth } from '@/auth';

// Mock auth
jest.mock('@/auth');
const mockAuth = auth as jest.MockedFunction<typeof auth>;

// Use real Prisma for integration tests
jest.unmock('@/lib/connections');

describe('Cost Dashboard API Integration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = getPrismaInstance();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up data before each test
    await prisma.costEvent.deleteMany({});
    await prisma.costBudget.deleteMany({});
    
    // Mock authenticated admin user
    mockAuth.mockResolvedValue({
      user: {
        id: 'admin-123',
        role: 'ADMIN',
        email: 'admin@test.com',
      },
    } as any);
  });

  describe('Cost Overview API', () => {
    it('should return cost overview with correct aggregations', async () => {
      // Arrange - Create test cost events
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

      // Today's events
      await prisma.costEvent.createMany({
        data: [
          {
            ts: new Date(),
            provider: Provider.OPENAI,
            product: 'gpt-4',
            unit: Unit.TOKENS_IN,
            units: 1000000,
            currency: 'USD',
            unitPrice: 10.0,
            cost: 10.0,
            status: EventStatus.PRICED,
            inboxId: 'inbox-1',
            intent: 'greeting',
            externalId: 'today-1',
            raw: {},
          },
          {
            ts: new Date(),
            provider: Provider.META_WHATSAPP,
            product: 'WABA',
            unit: Unit.WHATSAPP_TEMPLATE,
            units: 1,
            currency: 'USD',
            unitPrice: 0.055,
            cost: 0.055,
            status: EventStatus.PRICED,
            inboxId: 'inbox-2',
            intent: 'welcome',
            externalId: 'today-2',
            raw: {},
          },
        ],
      });

      // Month's events (including today)
      const lastWeek = new Date(today);
      lastWeek.setDate(today.getDate() - 7);
      
      await prisma.costEvent.create({
        data: {
          ts: lastWeek,
          provider: Provider.OPENAI,
          product: 'gpt-3.5-turbo',
          unit: Unit.TOKENS_OUT,
          units: 500000,
          currency: 'USD',
          unitPrice: 2.0,
          cost: 1.0,
          status: EventStatus.PRICED,
          inboxId: 'inbox-1',
          intent: 'response',
          externalId: 'week-1',
          raw: {},
        },
      });

      // Import the API route handler
      const { GET } = await import('@/app/api/admin/cost-monitoring/overview/route');

      // Act
      const request = new NextRequest('http://localhost:3000/api/admin/cost-monitoring/overview');
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('today');
      expect(data).toHaveProperty('month');
      expect(data).toHaveProperty('topInboxes');
      expect(data).toHaveProperty('recentEvents');

      // Check today's total (10.0 + 0.055)
      expect(Number(data.today)).toBeCloseTo(10.055, 3);
      
      // Check month's total (10.0 + 0.055 + 1.0)
      expect(Number(data.month)).toBeCloseTo(11.055, 3);

      // Check top inboxes
      expect(data.topInboxes).toHaveLength(2);
      expect(data.topInboxes[0].inboxId).toBe('inbox-1');
      expect(Number(data.topInboxes[0]._sum.cost)).toBeCloseTo(10.0, 2);

      // Check recent events
      expect(data.recentEvents).toHaveLength(3);
      expect(data.recentEvents[0]).toHaveProperty('ts');
      expect(data.recentEvents[0]).toHaveProperty('provider');
      expect(data.recentEvents[0]).toHaveProperty('cost');
    });

    it('should require admin authentication', async () => {
      // Arrange - Mock unauthenticated user
      mockAuth.mockResolvedValue(null);

      // Import the API route handler
      const { GET } = await import('@/app/api/admin/cost-monitoring/overview/route');

      // Act
      const request = new NextRequest('http://localhost:3000/api/admin/cost-monitoring/overview');
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Não autorizado');
    });

    it('should reject non-admin users', async () => {
      // Arrange - Mock regular user
      mockAuth.mockResolvedValue({
        user: {
          id: 'user-123',
          role: 'USER',
          email: 'user@test.com',
        },
      } as any);

      // Import the API route handler
      const { GET } = await import('@/app/api/admin/cost-monitoring/overview/route');

      // Act
      const request = new NextRequest('http://localhost:3000/api/admin/cost-monitoring/overview');
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(401);
    });
  });

  describe('Cost Breakdown API', () => {
    it('should return detailed cost breakdown with filters', async () => {
      // Arrange - Create diverse cost events
      const baseDate = new Date('2024-01-15T10:00:00Z');
      
      await prisma.costEvent.createMany({
        data: [
          // OpenAI events
          {
            ts: baseDate,
            provider: Provider.OPENAI,
            product: 'gpt-4',
            unit: Unit.TOKENS_IN,
            units: 1000000,
            currency: 'USD',
            unitPrice: 10.0,
            cost: 10.0,
            status: EventStatus.PRICED,
            inboxId: 'inbox-1',
            userId: 'user-1',
            intent: 'chat',
            externalId: 'openai-1',
            raw: {},
          },
          {
            ts: new Date(baseDate.getTime() + 3600000), // +1 hour
            provider: Provider.OPENAI,
            product: 'gpt-3.5-turbo',
            unit: Unit.TOKENS_OUT,
            units: 500000,
            currency: 'USD',
            unitPrice: 2.0,
            cost: 1.0,
            status: EventStatus.PRICED,
            inboxId: 'inbox-1',
            userId: 'user-1',
            intent: 'chat',
            externalId: 'openai-2',
            raw: {},
          },
          // WhatsApp events
          {
            ts: new Date(baseDate.getTime() + 7200000), // +2 hours
            provider: Provider.META_WHATSAPP,
            product: 'WABA',
            unit: Unit.WHATSAPP_TEMPLATE,
            units: 10,
            currency: 'USD',
            unitPrice: 0.055,
            cost: 0.55,
            status: EventStatus.PRICED,
            inboxId: 'inbox-2',
            userId: 'user-2',
            intent: 'marketing',
            externalId: 'whatsapp-1',
            raw: {},
          },
        ],
      });

      // Import the API route handler
      const { GET } = await import('@/app/api/admin/cost-monitoring/breakdown/route');

      // Act - Test with date filter
      const url = new URL('http://localhost:3000/api/admin/cost-monitoring/breakdown');
      url.searchParams.set('startDate', '2024-01-15');
      url.searchParams.set('endDate', '2024-01-16');
      url.searchParams.set('inboxId', 'inbox-1');
      
      const request = new NextRequest(url);
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('byProvider');
      expect(data).toHaveProperty('byModel');
      expect(data).toHaveProperty('byInbox');
      expect(data).toHaveProperty('byHour');

      // Check provider breakdown (should only include inbox-1 events)
      expect(data.byProvider).toHaveProperty('OPENAI');
      expect(Number(data.byProvider.OPENAI)).toBeCloseTo(11.0, 2); // 10.0 + 1.0
      expect(data.byProvider).not.toHaveProperty('META_WHATSAPP'); // Filtered out

      // Check model breakdown
      expect(data.byModel).toHaveProperty('gpt-4');
      expect(data.byModel).toHaveProperty('gpt-3.5-turbo');
      expect(Number(data.byModel['gpt-4'])).toBeCloseTo(10.0, 2);
      expect(Number(data.byModel['gpt-3.5-turbo'])).toBeCloseTo(1.0, 2);

      // Check inbox breakdown
      expect(data.byInbox).toHaveProperty('inbox-1');
      expect(Number(data.byInbox['inbox-1'])).toBeCloseTo(11.0, 2);

      // Check hourly breakdown
      expect(data.byHour).toBeInstanceOf(Array);
      expect(data.byHour.length).toBeGreaterThan(0);
    });

    it('should handle empty results gracefully', async () => {
      // Import the API route handler
      const { GET } = await import('@/app/api/admin/cost-monitoring/breakdown/route');

      // Act - Query for non-existent data
      const url = new URL('http://localhost:3000/api/admin/cost-monitoring/breakdown');
      url.searchParams.set('startDate', '2025-01-01');
      url.searchParams.set('endDate', '2025-01-02');
      
      const request = new NextRequest(url);
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.byProvider).toEqual({});
      expect(data.byModel).toEqual({});
      expect(data.byInbox).toEqual({});
      expect(data.byHour).toEqual([]);
    });
  });

  describe('Cost Events API', () => {
    it('should return paginated cost events with filters', async () => {
      // Arrange - Create test events
      const events = [];
      for (let i = 0; i < 25; i++) {
        events.push({
          ts: new Date(Date.now() - i * 60000), // Each event 1 minute apart
          provider: i % 2 === 0 ? Provider.OPENAI : Provider.META_WHATSAPP,
          product: i % 2 === 0 ? 'gpt-4' : 'WABA',
          unit: i % 2 === 0 ? Unit.TOKENS_IN : Unit.WHATSAPP_TEMPLATE,
          units: i % 2 === 0 ? 100000 : 1,
          currency: 'USD',
          unitPrice: i % 2 === 0 ? 10.0 : 0.055,
          cost: i % 2 === 0 ? 1.0 : 0.055,
          status: EventStatus.PRICED,
          inboxId: `inbox-${i % 3}`,
          userId: `user-${i % 2}`,
          intent: i % 2 === 0 ? 'chat' : 'marketing',
          externalId: `event-${i}`,
          raw: {},
        });
      }

      await prisma.costEvent.createMany({ data: events });

      // Import the API route handler
      const { GET } = await import('@/app/api/admin/cost-monitoring/events/route');

      // Act - Test pagination
      const url = new URL('http://localhost:3000/api/admin/cost-monitoring/events');
      url.searchParams.set('page', '1');
      url.searchParams.set('limit', '10');
      url.searchParams.set('provider', 'OPENAI');
      
      const request = new NextRequest(url);
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('events');
      expect(data).toHaveProperty('pagination');

      // Check events
      expect(data.events).toHaveLength(10);
      data.events.forEach((event: any) => {
        expect(event.provider).toBe('OPENAI');
        expect(event).toHaveProperty('ts');
        expect(event).toHaveProperty('cost');
        expect(event).toHaveProperty('inboxId');
      });

      // Check pagination
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.limit).toBe(10);
      expect(data.pagination.total).toBe(13); // 13 OpenAI events out of 25
      expect(data.pagination.pages).toBe(2);
    });

    it('should support CSV export', async () => {
      // Arrange - Create test events
      await prisma.costEvent.create({
        data: {
          ts: new Date(),
          provider: Provider.OPENAI,
          product: 'gpt-4',
          unit: Unit.TOKENS_IN,
          units: 100000,
          currency: 'USD',
          unitPrice: 10.0,
          cost: 1.0,
          status: EventStatus.PRICED,
          inboxId: 'inbox-1',
          userId: 'user-1',
          intent: 'chat',
          externalId: 'csv-test-1',
          raw: {},
        },
      });

      // Import the API route handler
      const { GET } = await import('@/app/api/admin/cost-monitoring/events/route');

      // Act - Request CSV export
      const url = new URL('http://localhost:3000/api/admin/cost-monitoring/events');
      url.searchParams.set('format', 'csv');
      
      const request = new NextRequest(url);
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/csv');
      expect(response.headers.get('content-disposition')).toContain('attachment');

      const csvContent = await response.text();
      expect(csvContent).toContain('timestamp,provider,product,unit,units,cost,currency');
      expect(csvContent).toContain('OPENAI,gpt-4,TOKENS_IN');
    });
  });

  describe('Budget Management API', () => {
    it('should create and manage budgets', async () => {
      // Import the API route handler
      const { POST, GET } = await import('@/app/api/admin/cost-monitoring/budgets/route');

      // Act - Create budget
      const createRequest = new NextRequest('http://localhost:3000/api/admin/cost-monitoring/budgets', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Budget',
          inboxId: 'inbox-test',
          period: 'monthly',
          limitUSD: 100.0,
          alertAt: 0.8,
        }),
        headers: {
          'content-type': 'application/json',
        },
      });

      const createResponse = await POST(createRequest);
      const createdBudget = await createResponse.json();

      // Assert creation
      expect(createResponse.status).toBe(201);
      expect(createdBudget).toHaveProperty('id');
      expect(createdBudget.name).toBe('Test Budget');
      expect(createdBudget.inboxId).toBe('inbox-test');
      expect(Number(createdBudget.limitUSD)).toBe(100.0);

      // Act - List budgets
      const listRequest = new NextRequest('http://localhost:3000/api/admin/cost-monitoring/budgets');
      const listResponse = await GET(listRequest);
      const budgets = await listResponse.json();

      // Assert listing
      expect(listResponse.status).toBe(200);
      expect(budgets).toHaveLength(1);
      expect(budgets[0].id).toBe(createdBudget.id);
    });

    it('should validate budget creation data', async () => {
      // Import the API route handler
      const { POST } = await import('@/app/api/admin/cost-monitoring/budgets/route');

      // Act - Create budget with invalid data
      const request = new NextRequest('http://localhost:3000/api/admin/cost-monitoring/budgets', {
        method: 'POST',
        body: JSON.stringify({
          name: '', // Invalid: empty name
          period: 'invalid', // Invalid: bad period
          limitUSD: -10, // Invalid: negative limit
        }),
        headers: {
          'content-type': 'application/json',
        },
      });

      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error).toHaveProperty('error');
    });
  });

  describe('API Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Arrange - Mock database error
      const originalFindMany = prisma.costEvent.findMany;
      prisma.costEvent.findMany = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      // Import the API route handler
      const { GET } = await import('@/app/api/admin/cost-monitoring/overview/route');

      // Act
      const request = new NextRequest('http://localhost:3000/api/admin/cost-monitoring/overview');
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toHaveProperty('error');

      // Restore original method
      prisma.costEvent.findMany = originalFindMany;
    });

    it('should validate query parameters', async () => {
      // Import the API route handler
      const { GET } = await import('@/app/api/admin/cost-monitoring/breakdown/route');

      // Act - Invalid date format
      const url = new URL('http://localhost:3000/api/admin/cost-monitoring/breakdown');
      url.searchParams.set('startDate', 'invalid-date');
      
      const request = new NextRequest(url);
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });
});