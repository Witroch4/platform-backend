"use strict";
/**
 * Queue Management Cache
 *
 * Export all cache-related functionality
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCacheOptimizerService = exports.getCacheInvalidationManager = exports.getUserCache = exports.getMetricsCache = exports.getQueueCache = exports.getCacheManager = void 0;
__exportStar(require("./cache-manager"), exports);
__exportStar(require("./queue-cache"), exports);
__exportStar(require("./metrics-cache"), exports);
__exportStar(require("./user-cache"), exports);
__exportStar(require("./cache-invalidation"), exports);
__exportStar(require("./cache-optimizer"), exports);
// Re-export singleton instances for convenience
var cache_manager_1 = require("./cache-manager");
Object.defineProperty(exports, "getCacheManager", { enumerable: true, get: function () { return __importDefault(cache_manager_1).default; } });
var queue_cache_1 = require("./queue-cache");
Object.defineProperty(exports, "getQueueCache", { enumerable: true, get: function () { return __importDefault(queue_cache_1).default; } });
var metrics_cache_1 = require("./metrics-cache");
Object.defineProperty(exports, "getMetricsCache", { enumerable: true, get: function () { return __importDefault(metrics_cache_1).default; } });
var user_cache_1 = require("./user-cache");
Object.defineProperty(exports, "getUserCache", { enumerable: true, get: function () { return __importDefault(user_cache_1).default; } });
var cache_invalidation_1 = require("./cache-invalidation");
Object.defineProperty(exports, "getCacheInvalidationManager", { enumerable: true, get: function () { return __importDefault(cache_invalidation_1).default; } });
var cache_optimizer_1 = require("./cache-optimizer");
Object.defineProperty(exports, "getCacheOptimizerService", { enumerable: true, get: function () { return __importDefault(cache_optimizer_1).default; } });
