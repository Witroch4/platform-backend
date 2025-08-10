import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections';
import { getPublicMediaUrl, isMetaMediaUrl } from '@/lib/whatsapp-media';

/**
 * POST /api/admin/mtf-diamante/templates/ensure-media
 * Garante que o template oficial tenha uma mídia pública (MinIO) definida no HEADER quando for de mídia.
 * Entrada: { templateId: string } -> metaTemplateId da Meta
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Usuário não autenticado.' }, { status: 401 });
    }

    const { templateId } = await request.json();
    if (!templateId || typeof templateId !== 'string') {
      return NextResponse.json({ error: 'templateId inválido.' }, { status: 400 });
    }

    const prisma = getPrismaInstance();
    const template = await prisma.template.findFirst({
      where: {
        createdById: session.user.id,
        whatsappOfficialInfo: { metaTemplateId: templateId },
      },
      include: { whatsappOfficialInfo: true },
    });

    if (!template?.whatsappOfficialInfo) {
      return NextResponse.json({
        success: false,
        error: 'Template oficial não encontrado para este usuário.',
      }, { status: 404 });
    }

    const info = template.whatsappOfficialInfo;
    const components = (info.components as any) || {};

    // Verificar se já tem publicMediaUrl válido
    const existingPublicUrl = (components && components.publicMediaUrl) ? String(components.publicMediaUrl) : null;
    if (existingPublicUrl && !isMetaMediaUrl(existingPublicUrl)) {
      return NextResponse.json({ success: true, publicMediaUrl: existingPublicUrl });
    }

    // Procurar URL de exemplo do HEADER (imagem/video/documento)
    const header = extractHeaderComponent(components);
    const headerExampleUrl = header?.example?.header_handle?.[0];

    // Tenta obter/gerar URL pública usando helper (baixará da Meta e fará upload se preciso)
    const publicUrl = await getPublicMediaUrl(templateId, session.user.id, headerExampleUrl);

    if (!publicUrl) {
      return NextResponse.json({
        success: false,
        error: 'Não foi possível obter URL pública para o HEADER.',
      }, { status: 422 });
    }

    return NextResponse.json({ success: true, publicMediaUrl: publicUrl });
  } catch (error: any) {
    console.error('[EnsureMedia] Erro ao garantir mídia pública do template:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
}

function extractHeaderComponent(components: any): any | null {
  if (!components || typeof components !== 'object') return null;
  // Pode estar como array
  if (Array.isArray(components)) {
    return components.find((c) => String(c?.type || '').toUpperCase() === 'HEADER') || null;
  }
  // Pode estar como objeto indexado ("0","1",...) ou com campos soltos e publicMediaUrl no root
  const numericKeys = Object.keys(components).filter((k) => /^\d+$/.test(k));
  if (numericKeys.length > 0) {
    const list = numericKeys.sort((a, b) => Number(a) - Number(b)).map((k) => components[k]);
    return list.find((c: any) => String(c?.type || '').toUpperCase() === 'HEADER') || null;
  }
  return components.HEADER || null;
}


