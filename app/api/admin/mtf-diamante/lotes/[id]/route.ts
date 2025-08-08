import { type NextRequest, NextResponse } from 'next/server';
import { getPrismaInstance } from '@/lib/connections';
import { auth } from '@/auth';

// PATCH - Atualizar lote (status ou dados completos)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { isActive, numero, nome, valor, dataInicio, dataFim } = body;

    // Buscar a configuração do MTF Diamante
    const config = await getPrismaInstance().mtfDiamanteConfig.findUnique({
      where: { userId: session.user.id },
      include: { variaveis: true }
    });

    if (!config) {
      return NextResponse.json({ error: 'Configuração não encontrada' }, { status: 404 });
    }

    // Buscar a variável de lotes
    const lotesVariavel = config.variaveis.find(v => v.chave === 'lotes_oab');
    
    if (!lotesVariavel || !lotesVariavel.valor || !Array.isArray(lotesVariavel.valor)) {
      return NextResponse.json({ error: 'Lotes não encontrados' }, { status: 404 });
    }

    // Encontrar e atualizar o lote
    const lotes: any[] = lotesVariavel.valor as unknown as any[];
    const loteIndex = lotes.findIndex((l: any) => l.id === id);
    
    if (loteIndex === -1) {
      return NextResponse.json({ error: 'Lote não encontrado' }, { status: 404 });
    }

    // LÓGICA PARA GARANTIR APENAS UM LOTE ATIVO
    if (isActive === true) {
      // Se estamos ativando este lote, desativar todos os outros
      lotes.forEach((lote, index) => {
        if (index !== loteIndex) {
          lote.isActive = false;
        }
      });
      console.log(`[MTF Lotes] Desativando outros lotes ao ativar lote ${id}`);
    }

    // Atualizar o lote com os dados fornecidos
    lotes[loteIndex] = {
      ...lotes[loteIndex],
      numero: numero !== undefined ? parseInt(numero) : lotes[loteIndex].numero,
      nome: nome || lotes[loteIndex].nome,
      valor: valor || lotes[loteIndex].valor,
      dataInicio: dataInicio || lotes[loteIndex].dataInicio,
      dataFim: dataFim || lotes[loteIndex].dataFim,
      isActive: isActive !== undefined ? isActive : lotes[loteIndex].isActive
    };

    // Salvar as alterações
    await getPrismaInstance().mtfDiamanteVariavel.update({
      where: { id: lotesVariavel.id },
      data: { valor: lotes as any }
    });

    // Invalidar cache das variáveis (incluindo lotes) - força reload das variáveis no frontend
    try {
      const { getRedisInstance } = await import('@/lib/connections');
      const redis = getRedisInstance();
      
      // Invalidar cache de variáveis para este usuário
      await redis.del(`mtf_variables:${session.user.id}`);
      await redis.del(`mtf_lotes:${session.user.id}`);
      
      console.log(`[MTF Lotes] Cache invalidado para usuário ${session.user.id} após edição de lote`);
    } catch (cacheError) {
      console.warn('[MTF Lotes] Erro ao invalidar cache:', cacheError);
      // Não falhar a operação por causa do cache
    }

    return NextResponse.json({ 
      message: 'Lote atualizado com sucesso',
      lote: lotes[loteIndex]
    });
  } catch (error) {
    console.error('Erro ao atualizar lote:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// DELETE - Deletar lote específico
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;

    // Buscar a configuração do MTF Diamante
    const config = await getPrismaInstance().mtfDiamanteConfig.findUnique({
      where: { userId: session.user.id },
      include: { variaveis: true }
    });

    if (!config) {
      return NextResponse.json({ error: 'Configuração não encontrada' }, { status: 404 });
    }

    // Buscar a variável de lotes
    const lotesVariavel = config.variaveis.find(v => v.chave === 'lotes_oab');
    
    if (!lotesVariavel || !lotesVariavel.valor || !Array.isArray(lotesVariavel.valor)) {
      return NextResponse.json({ error: 'Lotes não encontrados' }, { status: 404 });
    }

    // Filtrar o lote a ser removido
    const lotes: any[] = (lotesVariavel.valor as unknown as any[]).filter((l: any) => l.id !== id);

    // Salvar as alterações
    await getPrismaInstance().mtfDiamanteVariavel.update({
      where: { id: lotesVariavel.id },
      data: { valor: lotes as any }
    });

    // Invalidar cache das variáveis (incluindo lotes) - força reload das variáveis no frontend
    try {
      const { getRedisInstance } = await import('@/lib/connections');
      const redis = getRedisInstance();
      
      // Invalidar cache de variáveis para este usuário
      await redis.del(`mtf_variables:${session.user.id}`);
      await redis.del(`mtf_lotes:${session.user.id}`);
      
      console.log(`[MTF Lotes] Cache invalidado para usuário ${session.user.id} após remoção de lote`);
    } catch (cacheError) {
      console.warn('[MTF Lotes] Erro ao invalidar cache:', cacheError);
      // Não falhar a operação por causa do cache
    }

    return NextResponse.json({ 
      message: 'Lote removido com sucesso'
    });
  } catch (error) {
    console.error('Erro ao remover lote:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}