import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { TemplateLibraryService } from '@/app/lib/template-library-service';

// PUT - Process approval request (approve/reject)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can process approval requests
    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const { status, responseMessage } = body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "approved" or "rejected"' },
        { status: 400 }
      );
    }

    const approvalRequest = await TemplateLibraryService.processApprovalRequest(
      params.id,
      session.user.id,
      status,
      responseMessage
    );

    return NextResponse.json({ approvalRequest });
  } catch (error) {
    console.error('Error processing approval request:', error);
    return NextResponse.json(
      { error: 'Failed to process approval request' },
      { status: 500 }
    );
  }
}