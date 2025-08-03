"use strict";
//lib/redis.ts
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connection = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
// Detecta se está rodando em Docker
const isRunningInDocker = process.env.RUN_IN_DOCKER === 'true' || process.env.NODE_ENV === 'production';
// Variável para controlar se já exibimos a configuração
let configLogged = false;
// Função para exibir a configuração apenas uma vez
function logRedisConfig() {
    if (!configLogged) {
        console.log('Configuração de conexão com o Redis:', {
            host: process.env.REDIS_HOST || (isRunningInDocker ? 'redis' : '127.0.0.1'),
            port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
            useTLS: process.env.REDIS_USE_TLS === 'true',
            environment: isRunningInDocker ? 'Docker/Production' : 'Local Development',
        });
        configLogged = true;
    }
}
// Criação de uma única instância de conexão Redis
const redisConnection = new ioredis_1.default({
    host: process.env.REDIS_HOST || (isRunningInDocker ? 'redis' : '127.0.0.1'),
    port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 10000, // Aumenta o timeout para 10 segundos
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    // Se usar TLS:
    tls: process.env.REDIS_USE_TLS === 'true' ? {} : undefined,
});
exports.connection = redisConnection;
// Variável para controlar se já exibimos a mensagem de conexão
let connectionLogged = false;
redisConnection.on('error', (err) => {
    console.error('Erro na conexão com o Redis:', err);
});
redisConnection.on('connect', () => {
    if (!connectionLogged) {
        console.log('Conectado ao Redis com sucesso!');
        connectionLogged = true;
    }
});
// Exibe a configuração apenas uma vez
logRedisConfig();
