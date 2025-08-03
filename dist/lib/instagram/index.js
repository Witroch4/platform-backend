"use strict";
/**
 * Instagram Translation Infrastructure
 *
 * Main entry point for Instagram message translation system
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstagramTranslationErrorCodes = exports.InstagramTranslationError = void 0;
exports.initializeInstagramTranslationInfrastructure = initializeInstagramTranslationInfrastructure;
exports.cleanupInstagramTranslationInfrastructure = cleanupInstagramTranslationInfrastructure;
// Queue Infrastructure
__exportStar(require("../queue/instagram-translation.queue"), exports);
// Communication Manager
__exportStar(require("./communication-manager"), exports);
// Queue Monitor
__exportStar(require("./queue-monitor"), exports);
// Validation
__exportStar(require("../validation/instagram-translation-validation"), exports);
// Error Handling
__exportStar(require("../error-handling/instagram-translation-errors"), exports);
// Message Converter
__exportStar(require("./message-converter"), exports);
// Conversion Pipeline
__exportStar(require("./conversion-pipeline"), exports);
// Template Adapter
__exportStar(require("./template-adapter"), exports);
var instagram_translation_errors_1 = require("../error-handling/instagram-translation-errors");
Object.defineProperty(exports, "InstagramTranslationError", { enumerable: true, get: function () { return instagram_translation_errors_1.InstagramTranslationError; } });
Object.defineProperty(exports, "InstagramTranslationErrorCodes", { enumerable: true, get: function () { return instagram_translation_errors_1.InstagramTranslationErrorCodes; } });
// Main initialization function
async function initializeInstagramTranslationInfrastructure() {
    try {
        console.log('[Instagram Translation] Initializing infrastructure...');
        // Initialize communication manager
        const { getCommunicationManager } = await Promise.resolve().then(() => __importStar(require('./communication-manager')));
        const commManager = getCommunicationManager();
        // Test communication health
        const commHealth = await commManager.getHealthStatus();
        if (!commHealth.subscriber || !commHealth.publisher) {
            throw new Error('Communication manager not healthy');
        }
        // Initialize queue monitor
        const { startQueueMonitoring } = await Promise.resolve().then(() => __importStar(require('./queue-monitor')));
        await startQueueMonitoring();
        console.log('[Instagram Translation] Infrastructure initialized successfully');
        return { success: true };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Instagram Translation] Failed to initialize infrastructure:', errorMessage);
        return { success: false, error: errorMessage };
    }
}
// Cleanup function
async function cleanupInstagramTranslationInfrastructure() {
    try {
        console.log('[Instagram Translation] Cleaning up infrastructure...');
        // Stop queue monitoring
        const { stopQueueMonitoring } = await Promise.resolve().then(() => __importStar(require('./queue-monitor')));
        stopQueueMonitoring();
        // Cleanup communication manager
        const { cleanupCommunicationManager } = await Promise.resolve().then(() => __importStar(require('./communication-manager')));
        await cleanupCommunicationManager();
        console.log('[Instagram Translation] Infrastructure cleanup completed');
    }
    catch (error) {
        console.error('[Instagram Translation] Cleanup error:', error);
    }
}
