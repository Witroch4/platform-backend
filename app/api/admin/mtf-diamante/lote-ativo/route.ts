import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";

interface LoteOab {
  id: string;
  numero: number;
  nome: string;
  valor: string;
  dataInicio: string;
  dataFim: string;
  isActive: boolean;
}

// GET: Busca apenas o lote ativo para uso em variáveis
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Buscar configuração do usuário
    const config = await getPrismaInstance().mtfDiamanteConfig.findUnique({
      where: { userId: session.user.id },
      include: { variaveis: true },
    });

    if (!config) {
      return NextResponse.json({
        success: true,
        loteAtivo: null,
        variavel: {
          id: "lote_ativo",
          chave: "lote_ativo",
          valor: "*⚠️🚫 ATENÇÃO: Este serviço NÃO pode ser solicitado agora Nenhum lote ativo no momento. Veja sobre mandado de segurança!!*",
          tipo: "lote",
          descricao: "Lote Ativo - Nenhum lote selecionado",
          displayName: "Lote Ativo",
          isActive: false,
          loteData: null,
        },
      });
    }

    // Buscar lotes
    const lotesVariavel = config.variaveis.find((v) => v.chave === "lotes_oab");
    if (!lotesVariavel || !Array.isArray(lotesVariavel.valor)) {
      return NextResponse.json({
        success: true,
        loteAtivo: null,
        variavel: {
          id: "lote_ativo",
          chave: "lote_ativo",
          valor: "Nenhum lote configurado",
          tipo: "lote",
          descricao: "Lote Ativo - Nenhum lote configurado",
          displayName: "Lote Ativo",
          isActive: false,
          loteData: null,
        },
      });
    }

    const lotes = lotesVariavel.valor as unknown as LoteOab[];
    const loteAtivo = lotes.find((lote) => lote.isActive === true);

    if (loteAtivo) {
      // Formatar data e hora para exibição humanizada
      const formatarDataHora = (dataStr: string) => {
        if (!dataStr) return "";
        try {
          const data = new Date(dataStr);
          return data.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        } catch {
          return dataStr;
        }
      };

      const dataInicioFormatada = formatarDataHora(loteAtivo.dataInicio);
      const dataFimFormatada = formatarDataHora(loteAtivo.dataFim);

      // Valor humanizado do lote ativo
      const valorHumanizado = `${loteAtivo.nome || "Lote " + loteAtivo.numero}\nValor: R$ ${loteAtivo.valor}\nPeríodo: de ${dataInicioFormatada} a ${dataFimFormatada}`;

      return NextResponse.json({
        success: true,
        loteAtivo,
        variavel: {
          id: "lote_ativo",
          chave: "lote_ativo",
          valor: valorHumanizado,
          tipo: "lote",
          descricao: `Lote Ativo - ${loteAtivo.nome} (${loteAtivo.numero})`,
          displayName: "Lote Ativo",
          isActive: true,
          loteData: {
            id: loteAtivo.id,
            numero: loteAtivo.numero,
            nome: loteAtivo.nome,
            valor: loteAtivo.valor,
            dataInicio: loteAtivo.dataInicio,
            dataFim: loteAtivo.dataFim,
          },
        },
      });
    } else {
      return NextResponse.json({
        success: true,
        loteAtivo: null,
        variavel: {
          id: "lote_ativo",
          chave: "lote_ativo",
          valor: "*⚠️🚫 ATENÇÃO: Este serviço NÃO pode ser solicitado agora Nenhum lote ativo no momento. Veja sobre mandado de segurança!!*",
          tipo: "lote",
          descricao: "Lote Ativo - Nenhum lote selecionado",
          displayName: "Lote Ativo",
          isActive: false,
          loteData: null,
        },
      });
    }
  } catch (error) {
    console.error("Erro em GET /lote-ativo:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
