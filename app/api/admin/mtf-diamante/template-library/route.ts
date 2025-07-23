import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { TemplateLibraryService, type CreateTemplateLibraryData } from '@/app/lib/template-library-service';

// GET - Get library items
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as 'template' | 'interactive_message' | null;
    const scope = searchParams.get('scope') as 'global' | 'account_specific' | null;
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    let templates;

    if (search) {
      templates = await TemplateLibraryService.searchTemplates(search, session.user.id, type || undefined);
    } else if (category) {
      templates = await TemplateLibraryService.getTemplatesByCategory(category, session.user.id);
    } else {
      templates = await TemplateLibraryService.getLibraryItems(
        session.user.id,
        type || undefined,
        scope || undefined
      );
    }

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error fetching template library:', error);
    return NextResponse.json(
      { error: 'Failed to fetch template library' },
      { status: 500 }
    );
  }
}

// POST - Create new template library item
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      description,
      type,
      scope,
      content,
      category,
      language,
      tags
    } = body;

    // Validate required fields
    if (!name || !type || !scope || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: name, type, scope, content' },
        { status: 400 }
      );
    }

    // Validate type
    if (!['template', 'interactive_message'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be "template" or "interactive_message"' },
        { status: 400 }
      );
    }

    // Validate scope
    if (!['global', 'account_specific'].includes(scope)) {
      return NextResponse.json(
        { error: 'Invalid scope. Must be "global" or "account_specific"' },
        { status: 400 }
      );
    }

    // Only admins can create global templates
    if (scope === 'global' && session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can create global templates' },
        { status: 403 }
      );
    }

    const templateData: CreateTemplateLibraryData = {
      name,
      description,
      type,
      scope,
      content,
      category,
      language,
      tags,
      createdById: session.user.id
    };

    const template = await TemplateLibraryService.saveToLibrary(templateData);

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('Error creating template library item:', error);
    return NextResponse.json(
      { error: 'Failed to create template library item' },
      { status: 500 }
    );
  }
}