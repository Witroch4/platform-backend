/**
 * Unit tests for SocialWise Flow UX Writing and Legal Context Analysis
 */

import {
  LEGAL_TERMS,
  LEGAL_ACTIONS,
  analyzeLegalContext,
  generateLegalContextPrompt,
  buildWarmupButtonsPrompt,
  buildShortTitlesPrompt,
  buildDomainTopicsPrompt,
  getHumanizedTitle,
  FALLBACK_TITLES
} from '@/lib/socialwise-flow/ux-writing';

describe('SocialWise Flow UX Writing', () => {
  describe('LEGAL_TERMS', () => {
    it('should have comprehensive traffic terms', () => {
      expect(LEGAL_TERMS.traffic).toContain('detran');
      expect(LEGAL_TERMS.traffic).toContain('multa');
      expect(LEGAL_TERMS.traffic).toContain('cnh');
      expect(LEGAL_TERMS.traffic).toContain('recurso');
    });

    it('should have civil law terms', () => {
      expect(LEGAL_TERMS.civil).toContain('contrato');
      expect(LEGAL_TERMS.civil).toContain('danos morais');
      expect(LEGAL_TERMS.civil).toContain('indenização');
    });

    it('should have family law terms', () => {
      expect(LEGAL_TERMS.family).toContain('divórcio');
      expect(LEGAL_TERMS.family).toContain('pensão');
      expect(LEGAL_TERMS.family).toContain('guarda');
    });

    it('should have labor law terms', () => {
      expect(LEGAL_TERMS.labor).toContain('trabalhista');
      expect(LEGAL_TERMS.labor).toContain('demissão');
      expect(LEGAL_TERMS.labor).toContain('fgts');
    });
  });

  describe('LEGAL_ACTIONS', () => {
    it('should have defensive actions', () => {
      expect(LEGAL_ACTIONS.defensive).toContain('Recorrer');
      expect(LEGAL_ACTIONS.defensive).toContain('Contestar');
      expect(LEGAL_ACTIONS.defensive).toContain('Defender');
    });

    it('should have offensive actions', () => {
      expect(LEGAL_ACTIONS.offensive).toContain('Processar');
      expect(LEGAL_ACTIONS.offensive).toContain('Cobrar');
      expect(LEGAL_ACTIONS.offensive).toContain('Executar');
    });

    it('should have administrative actions', () => {
      expect(LEGAL_ACTIONS.administrative).toContain('Regularizar');
      expect(LEGAL_ACTIONS.administrative).toContain('Renovar');
      expect(LEGAL_ACTIONS.administrative).toContain('Transferir');
    });
  });

  describe('analyzeLegalContext', () => {
    it('should detect traffic-related terms with high confidence', () => {
      const userText = 'recebi uma multa do detran e quero recorrer da minha cnh';
      const result = analyzeLegalContext(userText);

      expect(result.detectedTerms).toContain('multa');
      expect(result.detectedTerms).toContain('detran');
      expect(result.detectedTerms).toContain('cnh');
      expect(result.primaryArea).toBe('traffic');
      expect(result.confidence).toBe('high');
    });

    it('should detect civil law terms with medium confidence', () => {
      const userText = 'tenho um contrato com problemas e preciso de indenização';
      const result = analyzeLegalContext(userText);

      expect(result.detectedTerms).toContain('contrato');
      expect(result.detectedTerms).toContain('indenização');
      expect(result.primaryArea).toBe('civil');
      expect(result.confidence).toBe('medium');
    });

    it('should return low confidence for generic text', () => {
      const userText = 'preciso de ajuda com uma questão legal';
      const result = analyzeLegalContext(userText);

      expect(result.detectedTerms).toHaveLength(0);
      expect(result.primaryArea).toBeNull();
      expect(result.confidence).toBe('low');
    });

    it('should suggest appropriate actions based on detected terms', () => {
      const userText = 'recebi uma multa do detran';
      const result = analyzeLegalContext(userText);

      expect(result.suggestedActions).toContain('Recorrer');
      expect(result.suggestedActions).toContain('Contestar');
    });

    it('should handle family law context', () => {
      const userText = 'quero me divorciar e definir a pensão e guarda dos filhos';
      const result = analyzeLegalContext(userText);

      expect(result.detectedTerms).toContain('divorciar');
      expect(result.detectedTerms).toContain('pensão');
      expect(result.detectedTerms).toContain('guarda');
      expect(result.primaryArea).toBe('family');
      expect(result.confidence).toBe('high'); // 3 terms = high confidence
    });

    it('should handle case insensitive matching', () => {
      const userText = 'RECEBI UMA MULTA DO DETRAN';
      const result = analyzeLegalContext(userText);

      expect(result.detectedTerms).toContain('multa');
      expect(result.detectedTerms).toContain('detran');
      expect(result.primaryArea).toBe('traffic');
    });
  });

  describe('generateLegalContextPrompt', () => {
    it('should generate context for traffic-related queries', () => {
      const userText = 'recebi uma multa do detran';
      const result = generateLegalContextPrompt(userText);

      expect(result).toContain('multa');
      expect(result).toContain('detran');
      expect(result).toContain('traffic');
      expect(result).toContain('Recorrer');
    });

    it('should handle generic queries', () => {
      const userText = 'preciso de ajuda legal';
      const result = generateLegalContextPrompt(userText);

      expect(result).toContain('Contexto: Questão jurídica geral');
    });

    it('should include confidence level', () => {
      const userText = 'multa detran cnh recurso';
      const result = generateLegalContextPrompt(userText);

      expect(result).toContain('Confiança: high');
    });
  });

  describe('buildWarmupButtonsPrompt', () => {
    const candidates = [
      { slug: 'recurso_multa_transito', desc: 'Recurso administrativo contra multa de trânsito' },
      { slug: 'mandado_seguranca', desc: 'Ação judicial para direito líquido e certo' }
    ];

    it('should build complete prompt with candidates and context', () => {
      const userText = 'recebi uma multa do detran';
      const result = buildWarmupButtonsPrompt(userText, candidates);

      expect(result).toContain('recebi uma multa do detran');
      expect(result).toContain('@recurso_multa_transito');
      expect(result).toContain('@mandado_seguranca');
      expect(result).toContain('Contexto Legal Detectado');
    });

    it('should include legal context analysis', () => {
      const userText = 'problema com multa';
      const result = buildWarmupButtonsPrompt(userText, candidates);

      expect(result).toContain('multa');
      expect(result).toContain('traffic');
    });

    it('should format candidates correctly', () => {
      const userText = 'questão legal';
      const result = buildWarmupButtonsPrompt(userText, candidates);

      expect(result).toContain('1. @recurso_multa_transito: Recurso administrativo');
      expect(result).toContain('2. @mandado_seguranca: Ação judicial');
    });
  });

  describe('buildShortTitlesPrompt', () => {
    const intents = [
      { slug: 'recurso_multa_transito', desc: 'Recurso contra multa' },
      { slug: 'acao_cobranca', desc: 'Ação de cobrança de dívida' }
    ];

    it('should build prompt for batch title generation', () => {
      const result = buildShortTitlesPrompt(intents);

      expect(result).toContain('Máximo 4 palavras por título');
      expect(result).toContain('Máximo 20 caracteres por título');
      expect(result).toContain('1. recurso_multa_transito: Recurso contra multa');
      expect(result).toContain('2. acao_cobranca: Ação de cobrança de dívida');
    });

    it('should include UX writing guidelines', () => {
      const result = buildShortTitlesPrompt(intents);

      expect(result).toContain('Recorrer, Contestar, Defender');
      expect(result).toContain('Processar, Cobrar, Executar');
      expect(result).toContain('array JSON de strings');
    });

    it('should provide examples', () => {
      const result = buildShortTitlesPrompt(intents);

      expect(result).toContain('"Recorrer Multa"');
      expect(result).toContain('"Ação Judicial"');
      expect(result).toContain('"Defesa Admin"');
    });
  });

  describe('buildDomainTopicsPrompt', () => {
    it('should build prompt for domain topic suggestion', () => {
      const userText = 'preciso de ajuda legal';
      const result = buildDomainTopicsPrompt(userText);

      expect(result).toContain('preciso de ajuda legal');
      expect(result).toContain('Direito do Trânsito');
      expect(result).toContain('Direito Civil');
      expect(result).toContain('Direito de Família');
    });

    it('should include all major legal areas', () => {
      const userText = 'questão jurídica';
      const result = buildDomainTopicsPrompt(userText);

      expect(result).toContain('Direito Trabalhista');
      expect(result).toContain('Direito do Consumidor');
      expect(result).toContain('Direito Criminal');
      expect(result).toContain('Direito Previdenciário');
    });

    it('should specify response format', () => {
      const userText = 'ajuda legal';
      const result = buildDomainTopicsPrompt(userText);

      expect(result).toContain('"response_text"');
      expect(result).toContain('"buttons"');
      expect(result).toContain('@direito_transito');
    });
  });

  describe('getHumanizedTitle', () => {
    it('should return humanized titles for known intents', () => {
      expect(getHumanizedTitle('recurso_multa_transito')).toBe('Recorrer Multa');
      expect(getHumanizedTitle('@acao_cobranca')).toBe('Cobrar Dívida');
      expect(getHumanizedTitle('divorcio_consensual')).toBe('Divórcio');
    });

    it('should return generic fallback for unknown intents', () => {
      expect(getHumanizedTitle('intent_desconhecido')).toBe('Consulta');
      expect(getHumanizedTitle('@outro_intent')).toBe('Consulta');
    });

    it('should handle empty and null inputs', () => {
      expect(getHumanizedTitle('')).toBe('Consulta');
      expect(getHumanizedTitle(null as any)).toBe('Consulta');
    });
  });

  describe('FALLBACK_TITLES', () => {
    it('should have titles for traffic intents', () => {
      expect(FALLBACK_TITLES.recurso_multa_transito).toBe('Recorrer Multa');
      expect(FALLBACK_TITLES.defesa_administrativa_detran).toBe('Defesa Admin');
      expect(FALLBACK_TITLES.suspensao_cnh).toBe('Suspensão CNH');
    });

    it('should have titles for civil intents', () => {
      expect(FALLBACK_TITLES.acao_cobranca).toBe('Cobrar Dívida');
      expect(FALLBACK_TITLES.danos_morais).toBe('Danos Morais');
      expect(FALLBACK_TITLES.rescisao_contrato).toBe('Rescindir');
    });

    it('should have titles for family intents', () => {
      expect(FALLBACK_TITLES.divorcio_consensual).toBe('Divórcio');
      expect(FALLBACK_TITLES.pensao_alimenticia).toBe('Pensão');
      expect(FALLBACK_TITLES.guarda_compartilhada).toBe('Guarda');
    });

    it('should have titles for labor intents', () => {
      expect(FALLBACK_TITLES.rescisao_trabalhista).toBe('Rescisão');
      expect(FALLBACK_TITLES.horas_extras).toBe('Horas Extras');
      expect(FALLBACK_TITLES.assedio_moral).toBe('Assédio');
    });

    it('should have generic fallbacks', () => {
      expect(FALLBACK_TITLES.consulta_juridica).toBe('Consulta');
      expect(FALLBACK_TITLES.orientacao_legal).toBe('Orientação');
      expect(FALLBACK_TITLES.analise_caso).toBe('Analisar Caso');
    });
  });
});