"use strict";
/**
 * Configuration for mapping quick reply button IDs to emoji reactions
 * This allows automatic emoji reactions when users click specific buttons
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BUTTON_REACTIONS = void 0;
exports.getEmojiForButton = getEmojiForButton;
exports.hasReactionMapping = hasReactionMapping;
exports.getAllButtonReactions = getAllButtonReactions;
/**
 * Default button-to-emoji mappings
 * These can be extended or overridden per account/configuration
 */
exports.DEFAULT_BUTTON_REACTIONS = [
    {
        buttonId: 'aceito_fazer',
        emoji: '❤️',
        description: 'Aceitar proposta - Coração'
    },
    {
        buttonId: 'recusar_proposta',
        emoji: '👎',
        description: 'Recusar proposta - Polegar para baixo'
    },
    {
        buttonId: 'id_enviar_prova',
        emoji: '📄',
        description: 'Enviar prova - Documento'
    },
    {
        buttonId: 'id_qual_pix',
        emoji: '💰',
        description: 'Perguntar sobre PIX - Dinheiro'
    },
    {
        buttonId: 'id_finalizar',
        emoji: '✋',
        description: 'Finalizar/Foi engano - Mão levantada'
    },
    {
        buttonId: 'change-button',
        emoji: '🔄',
        description: 'Alterar - Setas circulares'
    },
    {
        buttonId: 'cancel-button',
        emoji: '❌',
        description: 'Cancelar - X vermelho'
    }
];
/**
 * Get emoji for a button ID
 */
function getEmojiForButton(buttonId, customMappings) {
    // First check custom mappings if provided
    if (customMappings) {
        const customMapping = customMappings.find(mapping => mapping.buttonId === buttonId);
        if (customMapping) {
            return customMapping.emoji;
        }
    }
    // Then check default mappings
    const defaultMapping = exports.DEFAULT_BUTTON_REACTIONS.find(mapping => mapping.buttonId === buttonId);
    return defaultMapping?.emoji || null;
}
/**
 * Check if a button ID has a reaction mapping
 */
function hasReactionMapping(buttonId, customMappings) {
    return getEmojiForButton(buttonId, customMappings) !== null;
}
/**
 * Get all available button reaction mappings
 */
function getAllButtonReactions(customMappings) {
    const allMappings = [...exports.DEFAULT_BUTTON_REACTIONS];
    if (customMappings) {
        // Add custom mappings, replacing defaults if same buttonId exists
        customMappings.forEach(customMapping => {
            const existingIndex = allMappings.findIndex(mapping => mapping.buttonId === customMapping.buttonId);
            if (existingIndex >= 0) {
                allMappings[existingIndex] = customMapping;
            }
            else {
                allMappings.push(customMapping);
            }
        });
    }
    return allMappings;
}
