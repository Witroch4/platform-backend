import { NextResponse } from "next/server";
import { getPrismaInstance } from '@/lib/connections';

// Use Node.js runtime instead of Edge to enable Prisma
export const runtime = 'nodejs';

// POST - Associar ou desassociar espelho da biblioteca ao lead
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { leadId, espelhoId } = payload;
    
    if (!leadId) {
      return NextResponse.json({ error: "ID do lead é obrigatório" }, { status: 400 });
    }
    
    if (espelhoId) {
      // Associar espelho
      
      // Primeiro, verificar se o espelho existe e está ativo
      const espelho = await getPrismaInstance().espelhoBiblioteca.findFirst({
        where: {
          id: espelhoId,
          isAtivo: true
        }
      });
      
      if (!espelho) {
        return NextResponse.json({ 
          error: "Espelho não encontrado ou inativo" 
        }, { status: 404 });
      }
      
      // Atualizar o lead para usar este espelho
      await getPrismaInstance().leadOabData.update({
        where: { id: leadId },
        data: { 
          espelhoBibliotecaId: espelhoId,
          // Limpar espelho individual quando usar da biblioteca
          espelhoCorrecao: null as any,
          textoDOEspelho: null as any
        }
      });
      
      // Incrementar contador de uso do espelho
      await getPrismaInstance().espelhoBiblioteca.update({
        where: { id: espelhoId },
        data: {
          totalUsos: {
            increment: 1
          }
        }
      });
      
      console.log(`[API Associar] Espelho ${espelhoId} associado ao lead ${leadId}`);
      
      return NextResponse.json({
        success: true,
        message: "Espelho associado com sucesso",
        espelhoId: espelhoId
      });
    } else {
      // Desassociar espelho
      
      // Primeiro, buscar o espelho atual para decrementar o contador
      const lead = await getPrismaInstance().leadOabData.findUnique({
        where: { id: leadId },
        select: { espelhoBibliotecaId: true }
      });
      
      if (lead?.espelhoBibliotecaId) {
        // Decrementar contador do espelho que estava sendo usado
        await getPrismaInstance().espelhoBiblioteca.update({
          where: { id: lead.espelhoBibliotecaId },
          data: {
            totalUsos: {
              decrement: 1
            }
          }
        });
      }
      
      // Remover associação
      await getPrismaInstance().leadOabData.update({
        where: { id: leadId },
        data: { espelhoBibliotecaId: null }
      });
      
      console.log(`[API Associar] Espelho desassociado do lead ${leadId}`);
      
      return NextResponse.json({
        success: true,
        message: "Espelho desassociado com sucesso"
      });
    }
  } catch (error: any) {
    console.error("[API Associar] Erro ao processar associação:", error);
    return NextResponse.json({ 
      error: "Erro interno do servidor",
      details: error.message 
    }, { status: 500 });
  }
} 