import { GET, POST } from '../route';
import { auth } from '@/auth';
import { TemplateLibraryService } from '@/app/lib/template-library-service';

// Mock dependencies
jest.mock('@/auth');
jest.mock('@/app/lib/template-library-service');

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockTemplateLibraryService = TemplateLibraryService as jest.Mocked<typeof TemplateLibraryService>;

describe('/api/admin/mtf-diamante/template-library', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET', () => {
    it('should return templates for authenticated user', async () => {
      const mockSession = {
        user: { id: 'user1', role: 'DEFAULT' }
      };

      const mockTemplates = [
        {
          id: '1',
          name: 'Test Template',
          type: 'template',
          scope: 'global'
        }
      ];

      mockAuth.mockResolvedValue(mockSession as any);
      mockTemplateLibraryService.getLibraryItems.mockResolvedValue(mockTemplates as any);

      const request = new Request('http://localhost/api/admin/mtf-diamante/template-library');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.templates).toEqual(mockTemplates);
      expect(mockTemplateLibraryService.getLibraryItems).toHaveBeenCalledWith(
        'user1',
        undefined,
        undefined
      );
    });

    it('should filter by type and scope when provided', async () => {
      const mockSession = {
        user: { id: 'user1', role: 'DEFAULT' }
      };

      mockAuth.mockResolvedValue(mockSession as any);
      mockTemplateLibraryService.getLibraryItems.mockResolvedValue([]);

      const request = new Request('http://localhost/api/admin/mtf-diamante/template-library?type=template&scope=global');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockTemplateLibraryService.getLibraryItems).toHaveBeenCalledWith(
        'user1',
        'template',
        'global'
      );
    });

    it('should search templates when search param provided', async () => {
      const mockSession = {
        user: { id: 'user1', role: 'DEFAULT' }
      };

      mockAuth.mockResolvedValue(mockSession as any);
      mockTemplateLibraryService.searchTemplates.mockResolvedValue([]);

      const request = new Request('http://localhost/api/admin/mtf-diamante/template-library?search=marketing');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockTemplateLibraryService.searchTemplates).toHaveBeenCalledWith(
        'marketing',
        'user1',
        undefined
      );
    });

    it('should return 401 for unauthenticated user', async () => {
      mockAuth.mockResolvedValue(null);

      const request = new Request('http://localhost/api/admin/mtf-diamante/template-library');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });
  });

  describe('POST', () => {
    it('should create template for authenticated user', async () => {
      const mockSession = {
        user: { id: 'user1', role: 'ADMIN' }
      };

      const templateData = {
        name: 'Test Template',
        type: 'template',
        scope: 'global',
        content: {
          body: 'Hello {{name}}',
          variables: ['name']
        }
      };

      const mockCreatedTemplate = {
        id: '1',
        ...templateData,
        createdById: 'user1'
      };

      mockAuth.mockResolvedValue(mockSession as any);
      mockTemplateLibraryService.saveToLibrary.mockResolvedValue(mockCreatedTemplate as any);

      const request = new Request('http://localhost/api/admin/mtf-diamante/template-library', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(templateData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.template).toEqual(mockCreatedTemplate);
      expect(mockTemplateLibraryService.saveToLibrary).toHaveBeenCalledWith({
        ...templateData,
        createdById: 'user1'
      });
    });

    it('should return 400 for missing required fields', async () => {
      const mockSession = {
        user: { id: 'user1', role: 'ADMIN' }
      };

      mockAuth.mockResolvedValue(mockSession as any);

      const request = new Request('http://localhost/api/admin/mtf-diamante/template-library', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Test Template'
          // Missing required fields
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Missing required fields');
    });

    it('should return 400 for invalid type', async () => {
      const mockSession = {
        user: { id: 'user1', role: 'ADMIN' }
      };

      mockAuth.mockResolvedValue(mockSession as any);

      const request = new Request('http://localhost/api/admin/mtf-diamante/template-library', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Test Template',
          type: 'invalid_type',
          scope: 'global',
          content: { body: 'test' }
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid type');
    });

    it('should return 403 for non-admin creating global template', async () => {
      const mockSession = {
        user: { id: 'user1', role: 'DEFAULT' }
      };

      mockAuth.mockResolvedValue(mockSession as any);

      const request = new Request('http://localhost/api/admin/mtf-diamante/template-library', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Test Template',
          type: 'template',
          scope: 'global',
          content: { body: 'test' }
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Only administrators can create global templates');
    });

    it('should return 401 for unauthenticated user', async () => {
      mockAuth.mockResolvedValue(null);

      const request = new Request('http://localhost/api/admin/mtf-diamante/template-library', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
    });
  });
});