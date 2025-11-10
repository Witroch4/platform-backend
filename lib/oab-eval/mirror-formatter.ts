/**
 * Mirror Formatter - Remove campos desnecessários do espelho
 *
 * Objetivo: Reduzir tamanho do payload enviado ao agente de revisão
 * mantendo apenas: id, peso, descricao, nota_obtida
 *
 * Ganho: Economia de tokens de entrada (até 70% de redução em payloads grandes)
 */

import type { StudentMirrorItem, StudentMirrorPayload } from './types';

/**
 * Interface otimizada para agente de revisão
 * Contém apenas campos essenciais
 */
export interface OptimizedMirrorItem {
  id: string;
  peso: number | null;
  descricao: string;
  nota_obtida: number | null;
  subitens?: OptimizedMirrorItem[];
}

/**
 * Payload otimizado para análise do agente
 * Remove embedding_text, palavras_chave, fundamentos, etc
 */
export interface OptimizedMirrorPayload {
  meta: {
    area?: string;
    exam?: string;
    fonte?: string;
    data_aplicacao?: string;
    nome_capturado_lead?: string;
  };
  aluno: {
    nome: string;
    inscricao: string;
    situacao: string;
    nota_final: number | null;
    pontuacao_total_peca: number | null;
    pontuacao_total_questoes: number | null;
  };
  itens: OptimizedMirrorItem[];
}

/**
 * Filtra um item de espelho, removendo campos desnecessários
 * Mantém apenas: id, peso, descricao, nota_obtida + subitens recursivos
 */
export function filterMirrorItem(item: StudentMirrorItem): OptimizedMirrorItem {
  const filtered: OptimizedMirrorItem = {
    id: item.id,
    peso: item.peso ?? null,
    descricao: item.descricao,
    nota_obtida: item.nota_obtida ?? null,
  };

  // Processar subitens recursivamente
  if (item.subitens && Array.isArray(item.subitens) && item.subitens.length > 0) {
    filtered.subitens = item.subitens.map(filterMirrorItem);
  }

  return filtered;
}

/**
 * Otimiza um payload completo de espelho para envio ao agente
 *
 * Reduz tamanho removendo:
 * - embedding_text
 * - palavras_chave
 * - fundamentos
 * - alternativas_grupo
 * - escopo, questao (redundantes)
 * - nota_obtida_raw (mantém apenas nota_obtida)
 * - schema_docs
 */
export function optimizeMirrorPayload(
  payload: StudentMirrorPayload
): OptimizedMirrorPayload {
  return {
    meta: {
      area: payload.meta?.area,
      exam: payload.meta?.exam,
      fonte: payload.meta?.fonte,
      data_aplicacao: payload.meta?.data_aplicacao,
      nome_capturado_lead: payload.meta?.nome_capturado_lead,
    },
    aluno: {
      nome: payload.aluno.nome,
      inscricao: payload.aluno.inscricao,
      situacao: payload.aluno.situacao,
      nota_final: payload.aluno.nota_final ?? null,
      pontuacao_total_peca: payload.aluno.pontuacao_total_peca ?? null,
      pontuacao_total_questoes: payload.aluno.pontuacao_total_questoes ?? null,
    },
    itens: payload.itens.map(filterMirrorItem),
  };
}

/**
 * Calcula a economia de tokens estimada
 * Útil para observabilidade/logging
 */
export function estimateTokenSavings(
  original: string,
  optimized: string
): { original: number; optimized: number; savings: string } {
  const originalLength = original.length;
  const optimizedLength = optimized.length;
  const reductionPercent =
    ((originalLength - optimizedLength) / originalLength * 100).toFixed(1);

  return {
    original: originalLength,
    optimized: optimizedLength,
    savings: `${reductionPercent}%`,
  };
}

/**
 * Formata o espelho estruturado para markdown
 * Compatível com a interface StructuredMirror do mirror-generator-agent
 */
export function formatMirrorToMarkdown(
  structuredMirror: any,
  rubric: any
): string {
  // Implementação mínima - retorna representação textual básica
  return JSON.stringify(structuredMirror, null, 2);
}

/**
 * Formata os dados extraídos para JSON seguindo a estrutura StudentMirrorPayload
 * Converte StructuredMirror para o formato esperado pela UI
 */
export function formatMirrorToJson(
  extractedData: any,
  rubric: any,
  structuredMirror: any,
  metadata: {
    leadId?: string;
    nome?: string;
    telefone?: string;
  }
): StudentMirrorPayload {
  // Se structuredMirror for string, parsear
  let mirror = structuredMirror;
  if (typeof structuredMirror === 'string') {
    try {
      mirror = JSON.parse(structuredMirror);
    } catch (e) {
      console.error('[formatMirrorToJson] Erro ao parsear structuredMirror como JSON:', e);
      mirror = {};
    }
  }

  // Garantir que totais sempre existe com valores seguros
  const totalsPeca = mirror?.totais?.peca || 0;
  const totalsQuestoes = mirror?.totais?.questoes || 0;
  const totalsFinal = mirror?.totais?.final || 0;

  const maxPeca = mirror?.avaliacoes?.peca?.pontuacaoMaxima || 10;
  const maxQuestoes = mirror?.avaliacoes?.questoes?.length
    ? mirror.avaliacoes.questoes.reduce((sum: number, q: any) => sum + (q.pontuacaoMaxima || 0), 0)
    : 10;

  // Reconstruir itens a partir da avaliação estruturada
  // Usando rubric como base para obter descricoes completas
  const itensMap = new Map<string, StudentMirrorItem>();

  // Adicionar itens da peça se existirem
  if (mirror?.avaliacoes?.peca?.itens) {
    for (const item of mirror.avaliacoes.peca.itens) {
      const rubricItem = rubric?.grupos?.find((g: any) => g.id === item.id) || rubric?.itens?.find((i: any) => i.id === item.id);
      itensMap.set(item.id, {
        id: item.id,
        descricao: item.descricao || rubricItem?.descricao || '',
        escopo: 'Peça',
        questao: '',
        peso: rubricItem?.peso_maximo || item.pesoMaximo || null,
        nota_obtida: item.notaObtida ?? null,
        nota_obtida_raw: String(item.notaObtida ?? '0.00'),
        fundamentos: rubricItem?.fundamentos || [],
        alternativas_grupo: rubricItem?.alternativas_grupo || [],
        palavras_chave: rubricItem?.palavras_chave || [],
        embedding_text: rubricItem?.embedding_text || '',
      });
    }
  }

  // Adicionar itens das questões se existirem
  if (mirror?.avaliacoes?.questoes) {
    for (const q of mirror.avaliacoes.questoes) {
      for (const item of q.itens || []) {
        const rubricItem = rubric?.grupos?.find((g: any) => g.id === item.id) || rubric?.itens?.find((i: any) => i.id === item.id);
        itensMap.set(item.id, {
          id: item.id,
          descricao: item.descricao || rubricItem?.descricao || '',
          escopo: 'Questão',
          questao: q.questao,
          peso: rubricItem?.peso_maximo || item.pesoMaximo || null,
          nota_obtida: item.notaObtida ?? null,
          nota_obtida_raw: String(item.notaObtida ?? '0.00'),
          fundamentos: rubricItem?.fundamentos || [],
          alternativas_grupo: rubricItem?.alternativas_grupo || [],
          palavras_chave: rubricItem?.palavras_chave || [],
          embedding_text: rubricItem?.embedding_text || '',
        });
      }
    }
  }

  return {
    meta: mirror?.meta || {},
    aluno: {
      nome: mirror?.meta?.aluno || "Desconhecido",
      inscricao: mirror?.meta?.inscricao || "",
      situacao: mirror?.meta?.situacao || "NÃO AVALIADO",
      nota_final: mirror?.meta?.notaFinal ?? null,
      nota_final_raw: String(mirror?.meta?.notaFinal ?? "0.00"),
      pontuacao_total_peca: totalsPeca ?? null,
      pontuacao_total_peca_raw: String(totalsPeca ?? "0.00"),
      pontuacao_total_questoes: totalsQuestoes ?? null,
      pontuacao_total_questoes_raw: String(totalsQuestoes ?? "0.00"),
    },
    itens: Array.from(itensMap.values()),
    totais: {
      peca: {
        obtido: totalsPeca ?? 0,
        maximo: maxPeca ?? 10,
      },
      questoes: {
        obtido: totalsQuestoes ?? 0,
        maximo: maxQuestoes ?? 10,
      },
      final: {
        obtido: totalsFinal ?? 0,
        maximo: (maxPeca || 0) + (maxQuestoes || 0),
      },
    },
    schema_docs: mirror?.schema_docs,
  } as StudentMirrorPayload;
}
