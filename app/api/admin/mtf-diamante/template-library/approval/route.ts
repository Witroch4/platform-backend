import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { TemplateLibraryService } from '@/app/lib/template-library-service';

// GET - Get approval requests (admin only)
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can view approval requests
    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as 'pending' | 'approved' | 'rejected' | null;

    const requests = await TemplateLibraryService.getApprovalRequests(status || undefined);

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Error fetching approval requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch approval requests' },
      { status: 500 }
    );
  }
}

// POST - Request template approval
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { templateId, requestMessage, customVariables } = body;

    if (!templateId) {
      return NextResponse.json(
        { error: 'Template ID is required' },
        { status: 400 }
      );
    }

    const approvalRequest = await TemplateLibraryService.requestApproval(
      templateId,
      session.user.id,
      requestMessage,
      customVariables
    );

    return NextResponse.json({ approvalRequest }, { status: 201 });
  } catch (error) {
    console.error('Error requesting approval:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.message.includes('already have a pending')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (error.message.includes('does not require approval')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json(
      { error: 'Failed to request approval' },
      { status: 500 }
    );
  }
}