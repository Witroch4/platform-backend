/**
 * SocialWise Flow Graceful Degradation Strategies
 * Provides fallback responses for various failure scenarios
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import { createLogger } from '@/lib/utils/logger';
import { ChannelResponse, buildChannelResponse } from './channel-formatting';
import { IntentCandidate } from '@/services/openai';

const degradationLogger = createLogger('SocialWise-Degradation');

export interface DegradationContext {
  userText: string;
  channelType: string;
  inboxId: string;
  traceId?: string;
  failurePoint: 'embedding_timeout' | 'llm_timeout' | 'json_parse_failure' | 'concurrency_limit' | 'network_error' | 'unknown_error';
  originalError?: Error;
  candidates?: IntentCandidate[];
}

export interface DegradationResult {
  response: ChannelResponse;
  strategy: string;
  fallbackLevel: 'primary' | 'secondary' | 'tertiary';
  degradationMs: number;
}

/**
 * Humanized title generation for failed short title calls
 */
export function generateHumanizedTitles(intents: IntentCandidate[]): string[] {
  const titleMap: Record<string, string> = {
    // Legal domain mappings
    'recurso_oab': 'Recurso OAB',
    'inscricao_oab': 'Inscrição',
    'mandado_seguranca': 'Mandado',
    'recurso_multa_transito': 'Multa Trânsito',
    'divorcio': 'Divórcio',
    'pensao_alimenticia': 'Pensão',
    'inventario': 'Inventário',
    'usucapiao': 'Usucapião',
    'trabalhista': 'Trabalhista',
    'previdenciario': 'Previdência',
    'consumidor': 'Consumidor',
    'criminal': 'Criminal',
    'civil': 'Civil',
    'empresarial': 'Empresarial',
    'tributario': 'Tributário',
    'imobiliario': 'Imobiliário',
    'familia': 'Família',
    'contratos': 'Contratos',
    'sucessoes': 'Sucessões',
    'responsabilidade_civil': 'Resp. Civil',
    
    // Common action patterns
    'consulta': 'Consulta',
    'orientacao': 'Orientação',
    'documento': 'Documento',
    'certidao': 'Certidão',
    'procuracao': 'Procuração',
    'peticao': 'Petição',
    'recurso': 'Recurso',
    'defesa': 'Defesa',
    'acao': 'Ação',
    'processo': 'Processo'
  };

  return intents.map(intent => {
    // Handle null/undefined slugs
    if (!intent || !intent.slug) {
      return intent?.name || 'Consulta';
    }
    
    const slug = String(intent.slug).toLowerCase();
    
    // Try exact match first
    if (titleMap[slug]) {
      return titleMap[slug];
    }
    
    // Try partial matches
    for (const [key, title] of Object.entries(titleMap)) {
      if (slug.includes(key) || key.includes(slug)) {
        return title;
      }
    }
    
    // Fallback: humanize the slug
    return intent.name || humanizeSlug(slug);
  });
}

/**
 * Convert slug to human-readable title
 */
function humanizeSlug(slug: string): string {
  if (!slug) return 'Consulta';
  
  const humanized = String(slug)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
  
  // Clamp to 20 characters at word boundaries
  if (humanized.length <= 20) return humanized;
  
  const words = humanized.split(' ');
  let result = '';
  for (const word of words) {
    if ((result + ' ' + word).trim().length <= 20) {
      result = (result + ' ' + word).trim();
    } else {
      break;
    }
  }
  
  return result || humanized.slice(0, 20).trim();
}

/**
 * Get deterministic legal topics for fallback
 */
export function getDefaultLegalTopics(): Array<{ title: string; payload: string }> {
  return [
    { title: 'Família', payload: '@ia_familia' },
    { title: 'Trânsito', payload: '@ia_transito' },
    { title: 'Trabalhista', payload: '@ia_trabalhista' },
    { title: 'Consumidor', payload: '@ia_consumidor' },
    { title: 'Previdência', payload: '@ia_previdencia' },
    { title: 'Criminal', payload: '@ia_criminal' }
  ];
}

/**
 * Get contextual legal topics based on user text
 */
export function getContextualLegalTopics(userText: string): Array<{ title: string; payload: string }> {
  const text = (userText || '').toLowerCase();
  const topics: Array<{ title: string; payload: string }> = [];
  
  // Traffic-related keywords
  if (text.includes('multa') || text.includes('detran') || text.includes('cnh') || text.includes('transito') || text.includes('trânsito')) {
    topics.push({ title: 'Recurso Multa', payload: '@ia_recurso_multa' });
    topics.push({ title: 'CNH Suspensa', payload: '@ia_cnh_suspensa' });
  }
  
  // Family law keywords
  if (text.includes('divorcio') || text.includes('divórcio') || text.includes('pensao') || text.includes('pensão') || text.includes('guarda') || text.includes('familia') || text.includes('família')) {
    topics.push({ title: 'Divórcio', payload: '@ia_divorcio' });
    topics.push({ title: 'Pensão', payload: '@ia_pensao' });
  }
  
  // Labor law keywords
  if (text.includes('trabalho') || text.includes('demitido') || text.includes('rescisao') || text.includes('rescisão') || text.includes('fgts')) {
    topics.push({ title: 'Trabalhista', payload: '@ia_trabalhista' });
    topics.push({ title: 'Rescisão', payload: '@ia_rescisao' });
  }
  
  // Consumer law keywords
  if (text.includes('compra') || text.includes('produto') || text.includes('servico') || text.includes('serviço') || text.includes('consumidor') || text.includes('defeito') || text.includes('loja') || text.includes('troca')) {
    topics.push({ title: 'Consumidor', payload: '@ia_consumidor' });
    topics.push({ title: 'Produto Defeito', payload: '@ia_produto_defeito' });
  }
  
  // Criminal law keywords
  if (text.includes('crime') || text.includes('policia') || text.includes('polícia') || text.includes('processo') || text.includes('criminal')) {
    topics.push({ title: 'Criminal', payload: '@ia_criminal' });
    topics.push({ title: 'Defesa', payload: '@ia_defesa_criminal' });
  }
  
  // If no specific context found, return default topics
  if (topics.length === 0) {
    return getDefaultLegalTopics().slice(0, 3);
  }
  
  // Limit to 3 topics and add a general option
  const contextualTopics = topics.slice(0, 2);
  contextualTopics.push({ title: 'Outros Assuntos', payload: '@ia_outros' });
  
  return contextualTopics;
}

/**
 * Build fallback response for embedding timeout
 */
export function buildEmbeddingTimeoutFallback(context: DegradationContext): DegradationResult {
  const startTime = Date.now();
  
  try {
    const topics = getContextualLegalTopics(context.userText || '');
    const response = buildChannelResponseFromTopics(context.channelType || 'text', topics, 'Posso ajudar com:');
    
    degradationLogger.info('Embedding timeout fallback generated', {
      channelType: context.channelType,
      topicsCount: topics.length,
      traceId: context.traceId
    });
    
    return {
      response,
      strategy: 'embedding_timeout_contextual',
      fallbackLevel: 'primary',
      degradationMs: Date.now() - startTime
    };
    
  } catch (error) {
    degradationLogger.error('Error in embedding timeout fallback', {
      error: error instanceof Error ? error.message : String(error),
      traceId: context.traceId
    });
    
    return buildUltimateFallback(context);
  }
}

/**
 * Build fallback response for LLM timeout
 */
export function buildLlmTimeoutFallback(context: DegradationContext): DegradationResult {
  const startTime = Date.now();
  
  try {
    // If we have candidates from classification, use them
    if (context.candidates && context.candidates.length > 0) {
      const humanizedTitles = generateHumanizedTitles(context.candidates);
      const topics = context.candidates.slice(0, 3).map((candidate, index) => ({
        title: humanizedTitles[index] || candidate.name || humanizeSlug(candidate.slug || ''),
        payload: `@ia_${candidate.slug || 'consulta'}`
      }));
      
      const response = buildChannelResponseFromTopics(
        context.channelType || 'text', 
        topics, 
        'Identifiquei algumas opções:'
      );
      
      degradationLogger.info('LLM timeout fallback with candidates', {
        candidatesCount: context.candidates.length,
        traceId: context.traceId
      });
      
      return {
        response,
        strategy: 'llm_timeout_candidates',
        fallbackLevel: 'primary',
        degradationMs: Date.now() - startTime
      };
    }
    
    // No candidates, use contextual topics
    const topics = getContextualLegalTopics(context.userText || '');
    const response = buildChannelResponseFromTopics(context.channelType || 'text', topics, 'Como posso ajudar?');
    
    return {
      response,
      strategy: 'llm_timeout_contextual',
      fallbackLevel: 'secondary',
      degradationMs: Date.now() - startTime
    };
    
  } catch (error) {
    degradationLogger.error('Error in LLM timeout fallback', {
      error: error instanceof Error ? error.message : String(error),
      traceId: context.traceId
    });
    
    return buildUltimateFallback(context);
  }
}

/**
 * Build fallback response for JSON parse failure
 */
export function buildJsonParseFallback(context: DegradationContext): DegradationResult {
  const startTime = Date.now();
  
  try {
    const topics = getDefaultLegalTopics().slice(0, 3);
    const response = buildChannelResponseFromTopics(
      context.channelType, 
      topics, 
      'Desculpe, houve um erro. Como posso ajudar?'
    );
    
    degradationLogger.warn('JSON parse failure fallback', {
      originalError: context.originalError?.message,
      traceId: context.traceId
    });
    
    return {
      response,
      strategy: 'json_parse_failure',
      fallbackLevel: 'secondary',
      degradationMs: Date.now() - startTime
    };
    
  } catch (error) {
    return buildUltimateFallback(context);
  }
}

/**
 * Build fallback response for concurrency limit exceeded
 */
export function buildConcurrencyLimitFallback(context: DegradationContext): DegradationResult {
  const startTime = Date.now();
  
  try {
    const topics = getContextualLegalTopics(context.userText);
    const response = buildChannelResponseFromTopics(
      context.channelType, 
      topics, 
      'Sistema ocupado. Posso ajudar com:'
    );
    
    degradationLogger.info('Concurrency limit fallback', {
      channelType: context.channelType,
      traceId: context.traceId
    });
    
    return {
      response,
      strategy: 'concurrency_limit_degradation',
      fallbackLevel: 'primary',
      degradationMs: Date.now() - startTime
    };
    
  } catch (error) {
    return buildUltimateFallback(context);
  }
}

/**
 * Build ultimate fallback response (last resort)
 */
export function buildUltimateFallback(context: DegradationContext): DegradationResult {
  const startTime = Date.now();
  
  const response: ChannelResponse = {
    text: 'Desculpe, estou com dificuldades técnicas. Pode tentar novamente ou falar com um atendente?',
    action: undefined
  };
  
  degradationLogger.error('Ultimate fallback triggered', {
    failurePoint: context.failurePoint,
    originalError: context.originalError?.message,
    traceId: context.traceId
  });
  
  return {
    response,
    strategy: 'ultimate_fallback',
    fallbackLevel: 'tertiary',
    degradationMs: Date.now() - startTime
  };
}

/**
 * Helper function to build channel response from topics
 */
function buildChannelResponseFromTopics(
  channelType: string, 
  topics: Array<{ title: string; payload: string }>, 
  introText: string
): ChannelResponse {
  const buttons = topics.map(topic => ({
    title: topic.title,
    payload: topic.payload
  }));
  
  return buildChannelResponse(channelType, introText, buttons);
}

/**
 * Main degradation strategy selector
 */
export function selectDegradationStrategy(context: DegradationContext): DegradationResult {
  const startTime = Date.now();
  
  try {
    switch (context.failurePoint) {
      case 'embedding_timeout':
        return buildEmbeddingTimeoutFallback(context);
      
      case 'llm_timeout':
        return buildLlmTimeoutFallback(context);
      
      case 'json_parse_failure':
        return buildJsonParseFallback(context);
      
      case 'concurrency_limit':
        return buildConcurrencyLimitFallback(context);
      
      case 'network_error':
      case 'unknown_error':
      default:
        return buildUltimateFallback(context);
    }
    
  } catch (error) {
    degradationLogger.error('Error in degradation strategy selection', {
      error: error instanceof Error ? error.message : String(error),
      failurePoint: context.failurePoint,
      traceId: context.traceId
    });
    
    return buildUltimateFallback(context);
  }
}

/**
 * Test if degradation is needed based on error type
 */
export function shouldDegrade(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = (error.message || String(error)).toLowerCase();
  const errorName = (error.name || '').toLowerCase();
  
  // Timeout errors
  if (errorName === 'aborterror' || errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
    return true;
  }
  
  // Network errors
  if (errorMessage.includes('network') || errorMessage.includes('econnreset') || errorMessage.includes('etimedout') || errorMessage.includes('enotfound')) {
    return true;
  }
  
  // JSON parse errors
  if (errorMessage.includes('json') || errorMessage.includes('parse') || errorMessage.includes('unexpected token') || errorMessage.includes('unexpected end')) {
    return true;
  }
  
  // Rate limit errors
  if (errorMessage.includes('rate limit') || errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('exceeded')) {
    return true;
  }
  
  // Concurrency errors
  if (errorMessage.includes('concurrency') || errorMessage.includes('limit exceeded') || errorMessage.includes('too many')) {
    return true;
  }
  
  return false;
}

/**
 * Determine failure point from error
 */
export function determineFailurePoint(error: any): DegradationContext['failurePoint'] {
  if (!error) return 'unknown_error';
  
  const errorMessage = (error.message || String(error)).toLowerCase();
  const errorName = (error.name || '').toLowerCase();
  
  if (errorName === 'aborterror' || errorMessage.includes('aborted') || errorMessage.includes('timeout')) {
    if (errorMessage.includes('embedding')) {
      return 'embedding_timeout';
    }
    return 'llm_timeout';
  }
  
  if (errorMessage.includes('json') || errorMessage.includes('parse') || errorMessage.includes('unexpected')) {
    return 'json_parse_failure';
  }
  
  if (errorMessage.includes('concurrency') || errorMessage.includes('limit exceeded') || errorMessage.includes('too many') || errorMessage.includes('quota')) {
    return 'concurrency_limit';
  }
  
  if (errorMessage.includes('network') || errorMessage.includes('econnreset') || errorMessage.includes('etimedout') || errorMessage.includes('enotfound')) {
    return 'network_error';
  }
  
  return 'unknown_error';
}