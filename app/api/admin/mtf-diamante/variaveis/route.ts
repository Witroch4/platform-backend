import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections"
import { Prisma } from "@prisma/client"

// Função helper para obter descrição das variáveis
function getDescricaoVariavel(chave: string): string {
  const descricoes: Record<string, string> = {
    'chave_pix': 'Chave PIX para pagamentos (máx. 15 caracteres)',
    'nome_do_escritorio_rodape': 'Nome do escritório que aparece no rodapé',
    'valor_analise': 'Valor padrão da análise jurídica',
    'lotes_oab': 'Configuração dos lotes OAB (dados internos)'
  };
  return descricoes[chave] || 'Variável customizada';
}

// GET: Busca todas as variáveis do usuário (incluindo lotes formatados)
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Garantir existência do User após reset de banco
    try {
      const prisma = getPrismaInstance();
      const appUserId = session.user.id;
      const existing = await prisma.user.findUnique({ where: { id: appUserId } });
      if (!existing) {
        const syntheticEmail = ((session.user as any)?.email as string) || `${appUserId}@local.invalid`;
        await prisma.user.create({
          data: {
            id: appUserId,
            email: syntheticEmail,
            name: session.user.name || undefined,
          }
        });
      }
    } catch {}

    // Busca ou cria a configuração do MTF Diamante usando upsert
    let config = await getPrismaInstance().mtfDiamanteConfig.upsert({
      where: { userId: session.user.id },
      update: {},
      create: {
        userId: session.user.id,
        variaveis: {
          create: [
            { chave: "chave_pix", valor: "57944155000101" },
            { chave: "nome_do_escritorio_rodape", valor: "Dra. Amanda Sousa Advocacia e Consultoria Jurídica™" },
            { chave: "valor_analise", valor: "R$ 27,90" }
          ]
        }
      },
      include: { variaveis: true }
    });

    // Buscar lotes OAB e convertê-los em variáveis especiais
    const lotesVariavel = config.variaveis.find(v => v.chave === 'lotes_oab');
    const lotes = lotesVariavel && Array.isArray(lotesVariavel.valor) ? (lotesVariavel.valor as unknown as any[]) : [];

    // Converter variáveis normais (excluindo lotes_oab que é interna)
    const variaveisNormais = config.variaveis
      .filter(v => v.chave !== 'lotes_oab')
      .map(v => ({
        id: v.id,
        chave: v.chave,
        valor: String(v.valor || ''),
        tipo: 'normal' as const,
        descricao: getDescricaoVariavel(v.chave),
        displayName: v.chave.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      }));

    // Converter apenas o lote ativo em variável especial
    const variaveisLotes = [];
    const loteAtivo = lotes.find((lote: any) => lote.isActive === true);
    
    if (loteAtivo) {
      // Formatar data para exibição humanizada
      const formatarData = (dataStr: string) => {
        if (!dataStr) return '';
        try {
          const data = new Date(dataStr);
          return data.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        } catch {
          return dataStr;
        }
      };

      const dataInicioFormatada = formatarData(loteAtivo.dataInicio);
      const dataFimFormatada = formatarData(loteAtivo.dataFim);
      
      // Valor humanizado do lote ativo
      const valorHumanizado = `${loteAtivo.nome || 'Lote ' + loteAtivo.numero}\nValor: ${loteAtivo.valor}\nPeríodo: ${dataInicioFormatada} às ${dataFimFormatada}`;

      variaveisLotes.push({
        id: `lote_ativo`,
        chave: `lote_ativo`,
        valor: valorHumanizado,
        valorRaw: loteAtivo.valor, // Valor puro para processamento
        tipo: 'lote' as const,
        descricao: `Lote Ativo - ${loteAtivo.nome} (${loteAtivo.numero})`,
        displayName: `Lote Ativo`,
        isActive: true,
        loteData: {
          id: loteAtivo.id,
          numero: loteAtivo.numero,
          nome: loteAtivo.nome,
          valor: loteAtivo.valor,
          dataInicio: loteAtivo.dataInicio,
          dataFim: loteAtivo.dataFim
        }
      });
    } else {
      // Se não há lote ativo, mostrar variável vazia
      variaveisLotes.push({
        id: `lote_ativo`,
        chave: `lote_ativo`,
        valor: 'Nenhum lote ativo no momento',
        valorRaw: '', 
        tipo: 'lote' as const,
        descricao: 'Lote Ativo - Nenhum lote selecionado',
        displayName: `Lote Ativo`,
        isActive: false,
        loteData: null
      });
    }

    // Combinar todas as variáveis
    const todasVariaveis = [...variaveisNormais, ...variaveisLotes];

    console.log(`[MTF Variables] Retornando ${todasVariaveis.length} variáveis para usuário ${session.user.id}:`, 
      todasVariaveis.map(v => `${v.chave} (${v.tipo})`));

    return NextResponse.json({ success: true, variaveis: todasVariaveis });

  } catch (error) {
    console.error("Erro em GET /variaveis:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

// POST: Cria ou atualiza variáveis
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Garantir existência do User após reset de banco
    try {
      const prisma = getPrismaInstance();
      const appUserId = session.user.id;
      const existing = await prisma.user.findUnique({ where: { id: appUserId } });
      if (!existing) {
        const syntheticEmail = ((session.user as any)?.email as string) || `${appUserId}@local.invalid`;
        await prisma.user.create({
          data: {
            id: appUserId,
            email: syntheticEmail,
            name: session.user.name || undefined,
          }
        });
      }
    } catch {}

    const body = await request.json();
    const { variaveis } = body;

    if (!Array.isArray(variaveis)) {
      return NextResponse.json({ error: "Variáveis deve ser um array" }, { status: 400 });
    }

    // Busca ou cria a configuração do MTF Diamante usando upsert
    let config = await getPrismaInstance().mtfDiamanteConfig.upsert({
      where: { userId: session.user.id },
      update: {},
      create: { userId: session.user.id }
    });

    // Remove todas as variáveis existentes e cria as novas
    await getPrismaInstance().mtfDiamanteVariavel.deleteMany({
      where: { configId: config.id }
    });

    // Cria as novas variáveis
    const novasVariaveis = await getPrismaInstance().mtfDiamanteVariavel.createMany({
      data: variaveis.map((v: any) => ({
        configId: config.id,
        chave: v.chave,
        valor: v.valor
      }))
    });

    // Busca as variáveis criadas para retornar
    const variaveisCriadas = await getPrismaInstance().mtfDiamanteVariavel.findMany({
      where: { configId: config.id }
    });

    return NextResponse.json({ success: true, variaveis: variaveisCriadas });

  } catch (error) {
    console.error("Erro em POST /variaveis:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}