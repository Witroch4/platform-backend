"""Legal jargon translator - Simplify legal language for clients."""

import logging
import re
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.ai.agents.writer import RedatorAgent

logger = logging.getLogger(__name__)


class LegalTranslator:
    """
    Legal Jargon Translator.
    
    Translates complex legal language to accessible language:
    - Simplifies legal terminology
    - Maintains precision
    - Adds explanations of technical terms
    - Returns accessible version
    
    Validates: Requirement 2.9
    """
    
    def __init__(
        self,
        session: AsyncSession,
        tenant_id: UUID,
    ):
        """
        Initialize legal translator.
        
        Args:
            session: Database session
            tenant_id: Tenant ID for isolation
        """
        self.session = session
        self.tenant_id = tenant_id
        self.redator = RedatorAgent(session, tenant_id)
        
        # Common legal terms dictionary for quick reference
        self.term_dictionary = {
            "citação": "notificação oficial sobre o processo",
            "intimação": "comunicação oficial de uma decisão",
            "sentença": "decisão final do juiz",
            "acórdão": "decisão de um grupo de juízes (tribunal)",
            "liminar": "decisão provisória urgente",
            "tutela": "proteção judicial",
            "réu": "pessoa acusada ou processada",
            "autor": "pessoa que iniciou o processo",
            "petição": "documento formal enviado ao juiz",
            "recurso": "pedido para revisar uma decisão",
            "agravo": "tipo de recurso contra decisões",
            "apelação": "recurso contra sentença",
            "embargos": "recurso para esclarecer ou modificar decisão",
            "trânsito em julgado": "decisão final sem possibilidade de recurso",
            "prescrição": "perda do direito de processar por prazo vencido",
            "decadência": "perda de direito por não exercê-lo no prazo",
            "litigância de má-fé": "agir de forma desonesta no processo",
            "honorários": "pagamento ao advogado",
            "custas": "despesas do processo",
            "perícia": "análise técnica por especialista",
            "audiência": "reunião formal no tribunal",
        }
    
    async def translate(
        self,
        legal_text: str,
        add_explanations: bool = True,
        preserve_structure: bool = True,
    ) -> dict[str, Any]:
        """
        Translate legal text to accessible language.
        
        Args:
            legal_text: Text with legal terminology
            add_explanations: Whether to add explanations of terms
            preserve_structure: Whether to maintain text structure
        
        Returns:
            Dictionary with:
            - original: Original text
            - translated: Simplified text
            - terms_explained: List of terms with explanations
            - complexity_score: Original complexity (0-100)
        """
        logger.info(
            "Translating legal text",
            extra={
                "tenant_id": str(self.tenant_id),
                "text_length": len(legal_text),
                "add_explanations": add_explanations,
            },
        )
        
        # Detect legal terms in text
        detected_terms = self._detect_legal_terms(legal_text)
        
        # Calculate complexity score
        complexity_score = self._calculate_complexity(legal_text, detected_terms)
        
        # Translate using AI
        translated = await self.redator.translate_legal_jargon(
            legal_text=legal_text,
            add_explanations=add_explanations,
        )
        
        # Extract explanations if added
        terms_explained = []
        if add_explanations:
            terms_explained = self._extract_explanations(translated, detected_terms)
        
        result = {
            "original": legal_text,
            "translated": translated,
            "terms_explained": terms_explained,
            "complexity_score": complexity_score,
            "detected_terms": detected_terms,
        }
        
        logger.info(
            "Translation completed",
            extra={
                "tenant_id": str(self.tenant_id),
                "complexity_score": complexity_score,
                "terms_detected": len(detected_terms),
            },
        )
        
        return result
    
    def _detect_legal_terms(self, text: str) -> list[str]:
        """
        Detect legal terms in text.
        
        Args:
            text: Text to analyze
        
        Returns:
            List of detected legal terms
        """
        text_lower = text.lower()
        detected = []
        
        for term in self.term_dictionary.keys():
            # Use word boundaries to avoid partial matches
            pattern = r'\b' + re.escape(term) + r'\b'
            if re.search(pattern, text_lower):
                detected.append(term)
        
        return detected
    
    def _calculate_complexity(
        self,
        text: str,
        detected_terms: list[str],
    ) -> int:
        """
        Calculate text complexity score.
        
        Based on:
        - Number of legal terms
        - Average sentence length
        - Use of passive voice
        - Subordinate clauses
        
        Args:
            text: Text to analyze
            detected_terms: List of detected legal terms
        
        Returns:
            Complexity score (0-100)
        """
        score = 0
        
        # Legal terms (40 points max)
        term_score = min(40, len(detected_terms) * 5)
        score += term_score
        
        # Sentence length (30 points max)
        sentences = text.split('.')
        if sentences:
            avg_length = sum(len(s.split()) for s in sentences) / len(sentences)
            length_score = min(30, int(avg_length / 2))
            score += length_score
        
        # Passive voice indicators (15 points max)
        passive_indicators = ['foi', 'foram', 'será', 'serão', 'sendo', 'sido']
        passive_count = sum(1 for word in passive_indicators if word in text.lower())
        passive_score = min(15, passive_count * 3)
        score += passive_score
        
        # Complex conjunctions (15 points max)
        complex_conjunctions = ['outrossim', 'destarte', 'conquanto', 'porquanto', 'não obstante']
        conjunction_count = sum(1 for conj in complex_conjunctions if conj in text.lower())
        conjunction_score = min(15, conjunction_count * 5)
        score += conjunction_score
        
        return min(100, score)
    
    def _extract_explanations(
        self,
        translated_text: str,
        detected_terms: list[str],
    ) -> list[dict[str, str]]:
        """
        Extract term explanations from translated text.
        
        Looks for patterns like "term (explanation)" in the translated text.
        
        Args:
            translated_text: Translated text with explanations
            detected_terms: List of terms that were in original
        
        Returns:
            List of dictionaries with term and explanation
        """
        explanations = []
        
        # Pattern: word (explanation)
        pattern = r'(\w+)\s*\(([^)]+)\)'
        matches = re.finditer(pattern, translated_text)
        
        for match in matches:
            term = match.group(1).lower()
            explanation = match.group(2)
            
            # Check if this is one of our detected terms
            if any(term in detected_term.lower() for detected_term in detected_terms):
                explanations.append({
                    "term": term,
                    "explanation": explanation,
                })
        
        # Add dictionary explanations for terms not explained in text
        for term in detected_terms:
            if not any(term.lower() in exp["term"].lower() for exp in explanations):
                if term in self.term_dictionary:
                    explanations.append({
                        "term": term,
                        "explanation": self.term_dictionary[term],
                    })
        
        return explanations
    
    async def translate_batch(
        self,
        texts: list[str],
        add_explanations: bool = True,
    ) -> list[dict[str, Any]]:
        """
        Translate multiple texts in batch.
        
        Args:
            texts: List of texts to translate
            add_explanations: Whether to add explanations
        
        Returns:
            List of translation result dictionaries
        """
        logger.info(
            "Translating batch",
            extra={
                "tenant_id": str(self.tenant_id),
                "batch_size": len(texts),
            },
        )
        
        results = []
        
        for text in texts:
            try:
                result = await self.translate(
                    legal_text=text,
                    add_explanations=add_explanations,
                )
                results.append(result)
            
            except Exception as e:
                logger.error(
                    "Failed to translate text in batch",
                    extra={
                        "tenant_id": str(self.tenant_id),
                        "error": str(e),
                    },
                )
                # Add error result
                results.append({
                    "original": text,
                    "translated": text,  # Return original on error
                    "terms_explained": [],
                    "complexity_score": 0,
                    "detected_terms": [],
                    "error": str(e),
                })
        
        return results
    
    async def explain_term(self, term: str) -> str:
        """
        Get explanation for a specific legal term.
        
        Args:
            term: Legal term to explain
        
        Returns:
            Explanation text
        """
        term_lower = term.lower()
        
        # Check dictionary first
        if term_lower in self.term_dictionary:
            return self.term_dictionary[term_lower]
        
        # Use AI for terms not in dictionary
        prompt = f"""Explique o termo jurídico "{term}" em linguagem simples.

A explicação deve:
- Ser clara e acessível
- Ter no máximo 2 frases
- Evitar outros termos técnicos
- Ser precisa

Responda apenas com a explicação, sem introdução.
"""
        
        try:
            explanation = await self.redator.execute(
                user_message=prompt,
                temperature=0.3,
                max_tokens=100,
            )
            
            return explanation.strip()
        
        except Exception as e:
            logger.error(
                "Failed to explain term",
                extra={
                    "tenant_id": str(self.tenant_id),
                    "term": term,
                    "error": str(e),
                },
            )
            return f"Termo jurídico: {term}"
    
    def get_term_dictionary(self) -> dict[str, str]:
        """
        Get the complete term dictionary.
        
        Returns:
            Dictionary of legal terms and explanations
        """
        return self.term_dictionary.copy()
    
    async def add_term_to_dictionary(
        self,
        term: str,
        explanation: Optional[str] = None,
    ) -> None:
        """
        Add a new term to the dictionary.
        
        If explanation is not provided, uses AI to generate one.
        
        Args:
            term: Legal term
            explanation: Optional explanation
        """
        term_lower = term.lower()
        
        if explanation is None:
            explanation = await self.explain_term(term)
        
        self.term_dictionary[term_lower] = explanation
        
        logger.info(
            "Added term to dictionary",
            extra={
                "tenant_id": str(self.tenant_id),
                "term": term,
            },
        )
