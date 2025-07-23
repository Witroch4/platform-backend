import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createAgendamento, getAgendamentosByAccount } from "@/lib/agendamento.service";

/**
 * Handler para POST em /api/[accountid]/agendar
 * Cria um novo agendamento no Prisma e agenda no BullMQ, utilizando o accountid da rota.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accountid: string }> }
): Promise<NextResponse> {
  const { accountid } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    const body = await request.json();
    console.log("[Agendar] Corpo da requisição:", body);

    if (!accountid) {
      return NextResponse.json(
        { error: "Campo accountid é obrigatório na URL." },
        { status: 400 }
      );
    }
    console.log("[Agendar] Usando accountid da URL:", accountid);

    // Validação dos campos obrigatórios
    const midiaField = body.midias || body.midia;
    const camposObrigatorios = { Data: body.Data, midia: midiaField };
    const camposFaltando = Object.entries(camposObrigatorios)
      .filter(([_, value]) => !value)
      .map(([key]) => key);
    if (camposFaltando.length > 0) {
      return NextResponse.json(
        { error: `Campos obrigatórios faltando: ${camposFaltando.join(", ")}`, camposFaltando },
        { status: 400 }
      );
    }

    // Valida se pelo menos um tipo de post está selecionado
    if (!(body.Stories || body.Reels || body.PostNormal)) {
      return NextResponse.json(
        { error: "Selecione pelo menos um tipo de post (Stories, Reels ou Post Normal)" },
        { status: 400 }
      );
    }

    // Busca a conta do Instagram usando o accountid (que é o providerAccountId)
    const instagramAccount = await prisma.account.findFirst({
      where: {
        providerAccountId: accountid,
        userId: session.user.id,
        provider: "instagram",
      },
    });
    if (!instagramAccount) {
      return NextResponse.json(
        { error: "Conta do Instagram não encontrada ou não pertence ao usuário." },
        { status: 404 }
      );
    }
    console.log("[Agendar] Conta do Instagram encontrada:", instagramAccount);

    // Prepara os dados para o agendamento
    const midiasArray = Array.isArray(midiaField) ? midiaField : [midiaField];

    // Função para inferir o tipo MIME a partir da URL ou extensão do arquivo
    const inferMimeTypeFromUrl = (url: string): string => {
      // Extrai a extensão do arquivo da URL
      const extension = url.split('.').pop()?.toLowerCase();

      // Mapeamento de extensões comuns para tipos MIME
      const mimeTypes: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'pdf': 'application/pdf',
      };

      // Retorna o tipo MIME correspondente ou um tipo genérico
      return extension && mimeTypes[extension] ? mimeTypes[extension] : 'application/octet-stream';
    };

    // Prepara os dados de mídia para o serviço de agendamento
    const midias = midiasArray.map((m: any) => {
      // Garante que o mimeType nunca seja undefined
      const mimeType = m.mimeType || inferMimeTypeFromUrl(m.url);

      return {
        buffer: Buffer.from([]), // Buffer vazio pois os arquivos já foram enviados para o MinIO
        fileName: m.name || `file-${Date.now()}`,
        mimeType: mimeType,
        url: m.url,
        thumbnail_url: m.thumbnail_url,
      };
    });

    // Cria o agendamento
    const agendamento = await createAgendamento({
      userId: session.user.id,
      accountId: instagramAccount.id,
      Data: new Date(body.Data),
      Descricao: body.Descricao || body.Descrição || "",
      Facebook: body.Facebook || false,
      Instagram: body.Instagram || false,
      Linkedin: body.Linkedin || false,
      X: body.X || false,
      Stories: body.Stories || false,
      Reels: body.Reels || false,
      PostNormal: body.PostNormal || false,
      Diario: body.Diario || false,
      Semanal: body.Semanal || false,
      Randomizar: body.Randomizar || false,
      TratarComoUnicoPost: !body.TratarComoIndividual,
      TratarComoPostagensIndividuais: body.TratarComoIndividual || false,
      midias,
    });

    // O job já foi agendado dentro do createAgendamento
    console.log("[Agendar] Job agendado com sucesso para o agendamento:", agendamento.id);

    return NextResponse.json(agendamento, { status: 201 });
  } catch (error: any) {
    console.error("[Agendar] Erro ao criar agendamento:", error);
    return NextResponse.json(
      { error: "Erro ao criar agendamento", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Handler para GET em /api/[accountid]/agendar
 * Lista agendamentos filtrando pela conta usando o accountid (que corresponde ao providerAccountId).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountid: string }> }
): Promise<NextResponse> {
  const { accountid } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }
    if (!accountid) {
      return NextResponse.json(
        { error: "Campo accountid é obrigatório na URL." },
        { status: 400 }
      );
    }
    console.log("[Agendar] Listando agendamentos para accountid:", accountid);

    // Verifica se a conta pertence ao usuário autenticado
    const account = await prisma.account.findFirst({
      where: {
        providerAccountId: accountid,
        userId: session.user.id,
        provider: "instagram",
      },
    });
    if (!account) {
      return NextResponse.json(
        { error: "Conta não encontrada ou não pertence ao usuário." },
        { status: 404 }
      );
    }

    // Busca os agendamentos da conta
    const agendamentos = await getAgendamentosByAccount(account.id);

    return NextResponse.json(agendamentos);
  } catch (error: any) {
    console.error("[Agendar] Erro ao listar agendamentos:", error);
    return NextResponse.json(
      { error: "Erro ao listar agendamentos", details: error.message },
      { status: 500 }
    );
  }
}
