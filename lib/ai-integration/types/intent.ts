/**
 * Intent classification types
 * Based on requirements 13.1, 13.2
 */

export interface Intent {
	id: string;
	name: string;
	description?: string;
	actionType: string;
	templateId?: string;
	embedding: number[];
	similarityThreshold: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface IntentClassificationResult {
	intent?: string;
	score: number;
	candidates: Array<{
		name: string;
		similarity: number;
	}>;
	threshold: number;
	classified: boolean;
}

export interface IntentCandidate {
	name: string;
	similarity: number;
	threshold: number;
	actionType: string;
	templateId?: string;
}

export interface IntentHit {
	id: string;
	conversationId: string;
	messageId: string;
	candidateName: string;
	similarity: number;
	chosen: boolean;
	traceId?: string;
	createdAt: Date;
	expiresAt: Date;
}

export interface EmbeddingVector {
	dimensions: number;
	values: number[];
	model: string;
	generatedAt: Date;
}

export interface SimilaritySearchParams {
	embedding: number[];
	threshold: number;
	limit?: number;
	accountId?: number;
}

export interface SimilaritySearchResult {
	intent: string;
	similarity: number;
	actionType: string;
	templateId?: string;
}
