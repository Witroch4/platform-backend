import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateAgendamento } from "@/lib/agendamento.service";

/**
 * Handler para PATCH em /api/[accountid]/agendar/update-grupo/[agendamentoID]
 * Atualiza todos os agendamentos com o mesmo AgendamentoID.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ accountid: string; agendamentoID: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    const { accountid, agendamentoID } = await params;
    if (!accountid || !agendamentoID) {
      return NextResponse.json(
        { error: "Parâmetros inválidos." },
        { status: 400 }
      );
    }

    console.log(`[Agendar] Atualizando grupo de agendamentos com ID: ${agendamentoID}`);

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

    // Recebe os dados atualizados
    const updatedData = await request.json();
    console.log("[Agendar] Dados para atualização:", updatedData);

    // Primeiro, busca todos os agendamentos do grupo
    const agendamentos = await prisma.agendamento.findMany({
      where: {
        id: agendamentoID,
        userId: session.user.id,
      },
      include: {
        midias: true,
      },
    });

    if (!agendamentos || agendamentos.length === 0) {
      return NextResponse.json(
        { error: "Nenhum agendamento encontrado com este ID de grupo." },
        { status: 404 }
      );
    }

    console.log(`[Agendar] Encontrados ${agendamentos.length} agendamentos no grupo`);

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

    // Atualiza cada agendamento do grupo
    const updatePromises = agendamentos.map(async (agendamento) => {
      try {
        // Se cada agendamento tem sua própria mídia, preserva-a
        const agendamentoUpdateData = {
          ...updateData,
          midias: agendamento.TratarComoPostagensIndividuais ? agendamento.midias : updateData.midias,
        };

        const updatedAgendamento = await updateAgendamento(agendamento.id, agendamentoUpdateData);
        console.log("[Agendar] Agendamento atualizado com sucesso:", updatedAgendamento.id);

        return { id: agendamento.id, success: true };
      } catch (updateError: any) {
        console.error(`[Agendar] Erro ao atualizar agendamento ${agendamento.id}:`, updateError.message);
        return { id: agendamento.id, success: false, error: updateError.message };
      }
    });

    const results = await Promise.allSettled(updatePromises);

    const successful = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length;
    const failed = results.filter(r => r.status === 'rejected' || !(r.value as any).success).length;

    console.log(`[Agendar] Resultados da atualização: ${successful} sucesso, ${failed} falhas`);

    if (failed > 0) {
      return NextResponse.json({
        message: `${successful} agendamentos atualizados com sucesso, ${failed} falhas.`,
        count: successful,
        errors: results
          .filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !(r.value as any).success))
          .map(r => r.status === 'rejected' ? (r as PromiseRejectedResult).reason : (r as PromiseFulfilledResult<any>).value)
      }, { status: 207 }); // Multi-Status
    }

    return NextResponse.json({
      message: `${successful} agendamentos atualizados com sucesso.`,
      count: successful,
    });
  } catch (error: any) {
    console.error("[Agendar] Erro ao atualizar grupo de agendamentos:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar grupo de agendamentos", details: error.message },
      { status: 500 }
    );
  }
}