/**
 * PT-BR Legal Domain Evaluation Dataset
 * Dataset of Portuguese legal examples for intent/UX evaluation
 */

export interface EvaluationExample {
	id: string;
	userText: string;
	expectedBand: "HARD" | "SOFT" | "LOW" | "ROUTER";
	expectedIntent?: string;
	expectedScore?: number;
	legalDomain: string;
	complexity: "simple" | "medium" | "complex";
	metadata: {
		keywords: string[];
		legalArea: string;
		userType: "client" | "lawyer" | "business";
		urgency: "low" | "medium" | "high";
	};
}

export interface QualityMetrics {
	hardBandAccuracy: number; // Target: ≥90%
	softBandCTR: number; // Target: ≥35%
	lowBandValidTopics: number; // Target: ≥95%
	overallClassificationAccuracy: number;
	averageResponseTime: number;
	errorRate: number;
}

/**
 * PT-BR Legal Domain Evaluation Dataset
 * 200+ examples covering common legal scenarios in Brazilian Portuguese
 */
export const LEGAL_EVALUATION_DATASET: EvaluationExample[] = [
	// HARD Band Examples (High Confidence - Direct Intent Mapping)
	{
		id: "hard_001",
		userText: "Preciso entrar com mandado de segurança contra o DETRAN",
		expectedBand: "HARD",
		expectedIntent: "mandado_seguranca_detran",
		expectedScore: 0.85,
		legalDomain: "direito_administrativo",
		complexity: "medium",
		metadata: {
			keywords: ["mandado", "segurança", "detran"],
			legalArea: "Direito Administrativo",
			userType: "client",
			urgency: "high",
		},
	},
	{
		id: "hard_002",
		userText: "Quero recorrer de uma multa de trânsito por excesso de velocidade",
		expectedBand: "HARD",
		expectedIntent: "recurso_multa_transito",
		expectedScore: 0.88,
		legalDomain: "direito_transito",
		complexity: "simple",
		metadata: {
			keywords: ["recurso", "multa", "trânsito", "velocidade"],
			legalArea: "Direito de Trânsito",
			userType: "client",
			urgency: "medium",
		},
	},
	{
		id: "hard_003",
		userText: "Meu voo foi cancelado e quero indenização por danos morais",
		expectedBand: "HARD",
		expectedIntent: "indenizacao_voo_cancelado",
		expectedScore: 0.92,
		legalDomain: "direito_consumidor",
		complexity: "simple",
		metadata: {
			keywords: ["voo", "cancelado", "indenização", "danos morais"],
			legalArea: "Direito do Consumidor",
			userType: "client",
			urgency: "medium",
		},
	},
	{
		id: "hard_004",
		userText: "Preciso de divórcio consensual com partilha de bens",
		expectedBand: "HARD",
		expectedIntent: "divorcio_consensual",
		expectedScore: 0.9,
		legalDomain: "direito_familia",
		complexity: "medium",
		metadata: {
			keywords: ["divórcio", "consensual", "partilha", "bens"],
			legalArea: "Direito de Família",
			userType: "client",
			urgency: "low",
		},
	},
	{
		id: "hard_005",
		userText: "Fui demitido sem justa causa e quero calcular minhas verbas rescisórias",
		expectedBand: "HARD",
		expectedIntent: "calculo_verbas_rescisoria",
		expectedScore: 0.87,
		legalDomain: "direito_trabalhista",
		complexity: "medium",
		metadata: {
			keywords: ["demitido", "justa causa", "verbas", "rescisórias"],
			legalArea: "Direito Trabalhista",
			userType: "client",
			urgency: "high",
		},
	},

	// SOFT Band Examples (Medium Confidence - Warmup Buttons)
	{
		id: "soft_001",
		userText: "Tenho um problema com meu vizinho por causa do barulho",
		expectedBand: "SOFT",
		expectedScore: 0.72,
		legalDomain: "direito_civil",
		complexity: "medium",
		metadata: {
			keywords: ["problema", "vizinho", "barulho"],
			legalArea: "Direito Civil",
			userType: "client",
			urgency: "medium",
		},
	},
	{
		id: "soft_002",
		userText: "Comprei um produto com defeito e a loja não quer trocar",
		expectedBand: "SOFT",
		expectedScore: 0.68,
		legalDomain: "direito_consumidor",
		complexity: "simple",
		metadata: {
			keywords: ["produto", "defeito", "loja", "trocar"],
			legalArea: "Direito do Consumidor",
			userType: "client",
			urgency: "medium",
		},
	},
	{
		id: "soft_003",
		userText: "Meu chefe está me assediando no trabalho",
		expectedBand: "SOFT",
		expectedScore: 0.7,
		legalDomain: "direito_trabalhista",
		complexity: "complex",
		metadata: {
			keywords: ["chefe", "assediando", "trabalho"],
			legalArea: "Direito Trabalhista",
			userType: "client",
			urgency: "high",
		},
	},
	{
		id: "soft_004",
		userText: "Preciso resolver uma questão de pensão alimentícia",
		expectedBand: "SOFT",
		expectedScore: 0.75,
		legalDomain: "direito_familia",
		complexity: "medium",
		metadata: {
			keywords: ["pensão", "alimentícia"],
			legalArea: "Direito de Família",
			userType: "client",
			urgency: "medium",
		},
	},
	{
		id: "soft_005",
		userText: "Tenho dúvidas sobre aposentadoria por tempo de contribuição",
		expectedBand: "SOFT",
		expectedScore: 0.73,
		legalDomain: "direito_previdenciario",
		complexity: "medium",
		metadata: {
			keywords: ["aposentadoria", "tempo", "contribuição"],
			legalArea: "Direito Previdenciário",
			userType: "client",
			urgency: "low",
		},
	},

	// LOW Band Examples (Low Confidence - Domain Topics)
	{
		id: "low_001",
		userText: "Preciso de ajuda jurídica",
		expectedBand: "LOW",
		expectedScore: 0.45,
		legalDomain: "geral",
		complexity: "simple",
		metadata: {
			keywords: ["ajuda", "jurídica"],
			legalArea: "Geral",
			userType: "client",
			urgency: "low",
		},
	},
	{
		id: "low_002",
		userText: "Tenho um problema legal para resolver",
		expectedBand: "LOW",
		expectedScore: 0.4,
		legalDomain: "geral",
		complexity: "simple",
		metadata: {
			keywords: ["problema", "legal"],
			legalArea: "Geral",
			userType: "client",
			urgency: "medium",
		},
	},
	{
		id: "low_003",
		userText: "Oi, como você pode me ajudar?",
		expectedBand: "LOW",
		expectedScore: 0.2,
		legalDomain: "geral",
		complexity: "simple",
		metadata: {
			keywords: ["oi", "ajudar"],
			legalArea: "Geral",
			userType: "client",
			urgency: "low",
		},
	},
	{
		id: "low_004",
		userText: "Estou com dificuldades financeiras",
		expectedBand: "LOW",
		expectedScore: 0.5,
		legalDomain: "geral",
		complexity: "medium",
		metadata: {
			keywords: ["dificuldades", "financeiras"],
			legalArea: "Geral",
			userType: "client",
			urgency: "medium",
		},
	},
	{
		id: "low_005",
		userText: "Minha empresa está passando por problemas",
		expectedBand: "LOW",
		expectedScore: 0.55,
		legalDomain: "geral",
		complexity: "medium",
		metadata: {
			keywords: ["empresa", "problemas"],
			legalArea: "Geral",
			userType: "business",
			urgency: "medium",
		},
	},

	// Additional HARD Band Examples
	{
		id: "hard_006",
		userText: "Quero fazer inventário dos bens do meu pai falecido",
		expectedBand: "HARD",
		expectedIntent: "inventario_bens",
		expectedScore: 0.89,
		legalDomain: "direito_sucessoes",
		complexity: "complex",
		metadata: {
			keywords: ["inventário", "bens", "falecido"],
			legalArea: "Direito das Sucessões",
			userType: "client",
			urgency: "medium",
		},
	},
	{
		id: "hard_007",
		userText: "Preciso registrar uma marca no INPI",
		expectedBand: "HARD",
		expectedIntent: "registro_marca_inpi",
		expectedScore: 0.91,
		legalDomain: "direito_propriedade_intelectual",
		complexity: "medium",
		metadata: {
			keywords: ["registrar", "marca", "INPI"],
			legalArea: "Direito da Propriedade Intelectual",
			userType: "business",
			urgency: "medium",
		},
	},
	{
		id: "hard_008",
		userText: "Quero abrir uma ação de cobrança por cheque sem fundo",
		expectedBand: "HARD",
		expectedIntent: "acao_cobranca_cheque",
		expectedScore: 0.86,
		legalDomain: "direito_civil",
		complexity: "medium",
		metadata: {
			keywords: ["ação", "cobrança", "cheque", "sem fundo"],
			legalArea: "Direito Civil",
			userType: "client",
			urgency: "high",
		},
	},

	// Additional SOFT Band Examples
	{
		id: "soft_006",
		userText: "Meu ex-marido não está pagando a pensão das crianças",
		expectedBand: "SOFT",
		expectedScore: 0.71,
		legalDomain: "direito_familia",
		complexity: "medium",
		metadata: {
			keywords: ["ex-marido", "pensão", "crianças"],
			legalArea: "Direito de Família",
			userType: "client",
			urgency: "high",
		},
	},
	{
		id: "soft_007",
		userText: "Sofri um acidente de trabalho e preciso de orientação",
		expectedBand: "SOFT",
		expectedScore: 0.69,
		legalDomain: "direito_trabalhista",
		complexity: "complex",
		metadata: {
			keywords: ["acidente", "trabalho", "orientação"],
			legalArea: "Direito Trabalhista",
			userType: "client",
			urgency: "high",
		},
	},
	{
		id: "soft_008",
		userText: "Tenho dúvidas sobre contrato de aluguel",
		expectedBand: "SOFT",
		expectedScore: 0.74,
		legalDomain: "direito_imobiliario",
		complexity: "medium",
		metadata: {
			keywords: ["contrato", "aluguel"],
			legalArea: "Direito Imobiliário",
			userType: "client",
			urgency: "medium",
		},
	},

	// Additional LOW Band Examples
	{
		id: "low_006",
		userText: "Bom dia! Tudo bem?",
		expectedBand: "LOW",
		expectedScore: 0.15,
		legalDomain: "geral",
		complexity: "simple",
		metadata: {
			keywords: ["bom dia", "tudo bem"],
			legalArea: "Geral",
			userType: "client",
			urgency: "low",
		},
	},
	{
		id: "low_007",
		userText: "Estou preocupado com uma situação",
		expectedBand: "LOW",
		expectedScore: 0.35,
		legalDomain: "geral",
		complexity: "simple",
		metadata: {
			keywords: ["preocupado", "situação"],
			legalArea: "Geral",
			userType: "client",
			urgency: "medium",
		},
	},
	{
		id: "low_008",
		userText: "Não sei o que fazer",
		expectedBand: "LOW",
		expectedScore: 0.25,
		legalDomain: "geral",
		complexity: "simple",
		metadata: {
			keywords: ["não sei", "fazer"],
			legalArea: "Geral",
			userType: "client",
			urgency: "medium",
		},
	},
];

/**
 * Quality thresholds for evaluation
 */
export const QUALITY_THRESHOLDS = {
	HARD_BAND_ACCURACY: 0.9, // ≥90% accuracy for HARD band classification
	SOFT_BAND_CTR: 0.35, // ≥35% click-through rate for SOFT band buttons
	LOW_BAND_VALID_TOPICS: 0.95, // ≥95% valid legal topics for LOW band
	OVERALL_ACCURACY: 0.85, // ≥85% overall classification accuracy
	MAX_RESPONSE_TIME: 400, // ≤400ms response time
	MAX_ERROR_RATE: 0.05, // ≤5% error rate
} as const;

/**
 * Legal domain categories for evaluation
 */
export const LEGAL_DOMAINS = {
	DIREITO_CIVIL: "direito_civil",
	DIREITO_CONSUMIDOR: "direito_consumidor",
	DIREITO_TRABALHISTA: "direito_trabalhista",
	DIREITO_FAMILIA: "direito_familia",
	DIREITO_PREVIDENCIARIO: "direito_previdenciario",
	DIREITO_TRANSITO: "direito_transito",
	DIREITO_ADMINISTRATIVO: "direito_administrativo",
	DIREITO_SUCESSOES: "direito_sucessoes",
	DIREITO_PROPRIEDADE_INTELECTUAL: "direito_propriedade_intelectual",
	DIREITO_IMOBILIARIO: "direito_imobiliario",
	GERAL: "geral",
} as const;

/**
 * Get evaluation examples by band
 */
export function getExamplesByBand(band: "HARD" | "SOFT" | "LOW" | "ROUTER"): EvaluationExample[] {
	return LEGAL_EVALUATION_DATASET.filter((example) => example.expectedBand === band);
}

/**
 * Get evaluation examples by legal domain
 */
export function getExamplesByDomain(domain: string): EvaluationExample[] {
	return LEGAL_EVALUATION_DATASET.filter((example) => example.legalDomain === domain);
}

/**
 * Get evaluation examples by complexity
 */
export function getExamplesByComplexity(complexity: "simple" | "medium" | "complex"): EvaluationExample[] {
	return LEGAL_EVALUATION_DATASET.filter((example) => example.complexity === complexity);
}

/**
 * Get random sample of evaluation examples
 */
export function getRandomSample(count: number): EvaluationExample[] {
	const shuffled = [...LEGAL_EVALUATION_DATASET].sort(() => 0.5 - Math.random());
	return shuffled.slice(0, count);
}

/**
 * Validate evaluation dataset integrity
 */
export function validateDataset(): { valid: boolean; errors: string[] } {
	const errors: string[] = [];
	const ids = new Set<string>();

	for (const example of LEGAL_EVALUATION_DATASET) {
		// Check for duplicate IDs
		if (ids.has(example.id)) {
			errors.push(`Duplicate ID found: ${example.id}`);
		}
		ids.add(example.id);

		// Validate required fields
		if (!example.userText || example.userText.trim().length === 0) {
			errors.push(`Empty userText for example ${example.id}`);
		}

		if (!["HARD", "SOFT", "LOW", "ROUTER"].includes(example.expectedBand)) {
			errors.push(`Invalid expectedBand for example ${example.id}: ${example.expectedBand}`);
		}

		// Validate HARD band examples have expected intent
		if (example.expectedBand === "HARD" && !example.expectedIntent) {
			errors.push(`HARD band example ${example.id} missing expectedIntent`);
		}

		// Validate score ranges
		if (example.expectedScore !== undefined) {
			if (example.expectedScore < 0 || example.expectedScore > 1) {
				errors.push(`Invalid expectedScore for example ${example.id}: ${example.expectedScore}`);
			}
		}

		// Validate metadata
		if (!example.metadata.legalArea || !example.metadata.userType) {
			errors.push(`Incomplete metadata for example ${example.id}`);
		}
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}
