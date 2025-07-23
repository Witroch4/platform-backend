import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { TemplateLibraryService } from '@/app/lib/template-library-service';

// POST - Use interactive message directly
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { messageId, variables } = body;

    if (!messageId) {
      return NextResponse.json(
        { error: 'Message ID is required' },
        { status: 400 }
      );
    }

    if (!variables || typeof variables !== 'object') {
      return NextResponse.json(
        { error: 'Variables object is required' },
        { status: 400 }
      );
    }

    const result = await TemplateLibraryService.useInteractiveMessage(messageId, variables);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error using interactive message:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.message.includes('not an interactive message')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json(
      { error: 'Failed to use interactive message' },
      { status: 500 }
    );
  }
}