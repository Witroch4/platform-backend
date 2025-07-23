import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';

// Use Node.js runtime instead of Edge to enable Prisma
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Number.parseInt(searchParams.get('limit') || '50');
    const offset = Number.parseInt(searchParams.get('offset') || '0');

    // Buscar todas as imagens do usuário, ordenadas por data de criação (mais recentes primeiro)
    const images = await db.generatedImage.findMany({
      where: {
        userId: session.user.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit,
      skip: offset,
      include: {
        session: {
          select: {
            id: true,
            title: true,
            createdAt: true
          }
        }
      }
    });

    // Contar total de imagens do usuário
    const total = await db.generatedImage.count({
      where: {
        userId: session.user.id
      }
    });

    return NextResponse.json({
      success: true,
      images: images.map(img => ({
        id: img.id,
        imageUrl: img.imageUrl,
        thumbnailUrl: img.thumbnailUrl,
        prompt: img.prompt,
        revisedPrompt: img.revisedPrompt,
        model: img.model,
        createdAt: img.createdAt,
        chatSession: img.session
      })),
      total,
      limit,
      offset,
      hasMore: (offset + limit) < total
    });

  } catch (error: any) {
    console.error('Erro ao buscar galeria de imagens:', error);
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 