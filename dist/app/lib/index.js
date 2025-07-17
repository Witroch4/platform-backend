"use strict";
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
exports.getApiVersion = exports.getWhatsAppTemplatesUrl = exports.getWhatsAppApiUrl = exports.getWhatsAppConfig = exports.prisma = void 0;
// Exportar funções do módulo de configurações do WhatsApp
__exportStar(require("./whatsapp-config"), exports);
// Exportar outras funções conforme necessário
var prisma_1 = require("../../lib/prisma");
Object.defineProperty(exports, "prisma", { enumerable: true, get: function () { return __importDefault(prisma_1).default; } });
// Exportar funções úteis da lib
const whatsapp_config_1 = require("./whatsapp-config");
Object.defineProperty(exports, "getWhatsAppConfig", { enumerable: true, get: function () { return whatsapp_config_1.getWhatsAppConfig; } });
Object.defineProperty(exports, "getWhatsAppApiUrl", { enumerable: true, get: function () { return whatsapp_config_1.getWhatsAppApiUrl; } });
Object.defineProperty(exports, "getWhatsAppTemplatesUrl", { enumerable: true, get: function () { return whatsapp_config_1.getWhatsAppTemplatesUrl; } });
Object.defineProperty(exports, "getApiVersion", { enumerable: true, get: function () { return whatsapp_config_1.getApiVersion; } });
