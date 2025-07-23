import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateAgendamento } from "@/lib/agendamento.service";

/**
 * Handler para PATCH em /api/[accountid]/agendar/update/[id]
 * Atualiza um agendamento específico pelo ID.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ accountid: string; id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    const { accountid, id } = await params;
    if (!accountid || !id) {
      return NextResponse.json(
        { error: "Parâmetros inválidos." },
        { status: 400 }
      );
    }

    console.log(`[Agendar] Atualizando agendamento com ID: ${id}`);

    // Verifica se a conta pertence ao usuário
    const account = await prisma.account.findFirst({
      where: {
        providerAccountId: accountid,
        userId: session.user.id,
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Conta não encontrada ou não pertence ao usuário." },
        { status: 404 }
      );
    }

    // Verifica se o agendamento existe e pertence ao usuário
    const existingAgendamento = await prisma.agendamento.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingAgendamento) {
      return NextResponse.json(
        { error: "Agendamento não encontrado ou não pertence ao usuário." },
        { status: 404 }
      );
    }

    // Recebe os dados atualizados
    const updatedData = await request.json();
    console.log("[Agendar] Dados para atualização:", updatedData);

    // Prepara os dados para atualização
    const updateData = {
      ...(updatedData.Data && { Data: new Date(updatedData.Data) }),
      ...(updatedData.Descricao !== undefined && { Descricao: updatedData.Descricao }),
      ...(updatedData.Descrição !== undefined && { Descricao: updatedData.Descrição }),
      ...(updatedData.Facebook !== undefined && { Facebook: updatedData.Facebook }),
      ...(updatedData.Instagram !== undefined && { Instagram: updatedData.Instagram }),
      ...(updatedData.Linkedin !== undefined && { Linkedin: updatedData.Linkedin }),
      ...(updatedData.X !== undefined && { X: updatedData.X }),
      ...(updatedData.Stories !== undefined && { Stories: updatedData.Stories }),
      ...(updatedData.Reels !== undefined && { Reels: updatedData.Reels }),
      ...(updatedData.PostNormal !== undefined && { PostNormal: updatedData.PostNormal }),
      ...(updatedData.Diario !== undefined && { Diario: updatedData.Diario }),
      ...(updatedData.Semanal !== undefined && { Semanal: updatedData.Semanal }),
      ...(updatedData.Randomizar !== undefined && { Randomizar: updatedData.Randomizar }),
      ...(updatedData.TratarComoIndividual !== undefined && {
        TratarComoUnicoPost: !updatedData.TratarComoIndividual,
        TratarComoPostagensIndividuais: updatedData.TratarComoIndividual,
      }),
    };

    // Processa as mídias se existirem
    if (updatedData.midias || updatedData.midia) {
      // Garante que midias seja um array
      const midiasField = updatedData.midias || updatedData.midia;
      const midiasArray = Array.isArray(midiasField)
        ? midiasField
        : [midiasField];

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
      updateData.midias = midiasArray.map((m: any) => {
        // Garante que o mime_type nunca seja undefined
        const mime_type = m.mime_type || inferMimeTypeFromUrl(m.url);

        return {
          id: m.id,
          url: m.url,
          mime_type,
          thumbnail_url: m.thumbnail_url,
        };
      });

      console.log("[Agendar] Mídias preparadas para atualização:",
        updateData.midias.map((m: any) => ({ url: m.url, mime_type: m.mime_type }))
      );
    }

    // Atualiza o agendamento
    const agendamento = await updateAgendamento(id, updateData);

    // O job já foi reagendado dentro do updateAgendamento se a data foi alterada
    console.log("[Agendar] Agendamento atualizado com sucesso:", agendamento.id);

    return NextResponse.json({
      message: "Agendamento atualizado com sucesso.",
      data: agendamento,
    });
  } catch (error: any) {
    console.error("[Agendar] Erro ao atualizar agendamento:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar agendamento", details: error.message },
      { status: 500 }
    );
  }
}