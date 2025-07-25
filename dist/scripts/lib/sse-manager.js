"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sseManager = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
// --- Definição do Singleton no escopo global ---
// Isso garante que a mesma instância seja usada mesmo com o hot-reload do Next.js
const globalForSse = globalThis;
// --- Classe SseManager ---
class SseManager {
    connectionsByLead = new Map();
    publisher;
    subscriber;
    isInitialized = false;
    constructor() {
        console.log('[SSE Manager] 🚀 Criando nova instância...');
        this.initializeRedis();
    }
    initializeRedis() {
        const redisConfig = {
            host: process.env.REDIS_HOST || 'redis',
            port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
            password: process.env.REDIS_PASSWORD,
            maxRetriesPerRequest: null,
            connectTimeout: 15000,
            retryStrategy: (times) => Math.min(times * 100, 3000),
        };
        console.log('[SSE Redis] ⚙️ Inicializando com configuração:', {
            host: redisConfig.host,
            port: redisConfig.port,
            password: redisConfig.password ? '******' : 'undefined',
        });
        this.publisher = new ioredis_1.default(redisConfig);
        this.subscriber = new ioredis_1.default(redisConfig);
        this.subscriber.on('message', this.handleRedisMessage.bind(this));
        this.publisher.on('connect', () => {
            console.log('[SSE Redis] ✅ Publisher conectado.');
            this.isInitialized = true;
        });
        this.subscriber.on('connect', () => console.log('[SSE Redis] ✅ Subscriber conectado.'));
        const handleError = (client) => (error) => {
            console.error(`[SSE Redis] ❌ Erro no ${client}:`, error.message);
            if (client === 'publisher')
                this.isInitialized = false;
        };
        this.publisher.on('error', handleError('Publisher'));
        this.subscriber.on('error', handleError('Subscriber'));
    }
    handleRedisMessage(channel, message) {
        const leadId = channel.replace('sse:', '');
        const leadConnections = this.connectionsByLead.get(leadId);
        if (!leadConnections || leadConnections.size === 0) {
            console.warn(`[SSE Redis] ⚠️ Nenhuma conexão ativa para leadId ${leadId}. Mensagem descartada.`);
            return;
        }
        // 🔇 Log reduzido - apenas resumo
        console.log(`[SSE Redis] 📬 Entregando mensagem para ${leadConnections.size} cliente(s) do lead ${leadId}`);
        let successCount = 0;
        leadConnections.forEach((conn) => {
            try {
                conn.controller.enqueue(`data: ${message}\n\n`);
                successCount++;
            }
            catch (e) {
                console.warn(`[SSE Manager] ⚠️ Conexão ${conn.connectionId} fechada, removendo.`);
                this.removeConnection(leadId, conn.connectionId);
            }
        });
        // 🔇 Log apenas se houver falhas
        if (successCount !== leadConnections.size) {
            console.log(`[SSE Redis] 📊 Resumo: ${successCount}/${leadConnections.size} mensagens entregues`);
        }
    }
    addConnection(leadId, controller) {
        const connectionId = `${leadId}-${Date.now()}`;
        if (!this.connectionsByLead.has(leadId)) {
            this.connectionsByLead.set(leadId, new Map());
            // ====================================================================
            // CORREÇÃO: Removida a condição 'if (this.isInitialized)'
            // A biblioteca ioredis gerencia automaticamente a fila de comandos
            // e executa o subscribe assim que a conexão estiver estabelecida
            this.subscriber.subscribe(`sse:${leadId}`, (err, count) => {
                if (err) {
                    return console.error(`[SSE Redis] ❌ Falha ao se inscrever no canal sse:${leadId}`, err);
                }
                console.log(`[SSE Redis] 📡 Inscrição no canal sse:${leadId} confirmada. Total de inscrições nesta instância: ${count}`);
            });
            // ====================================================================
        }
        this.connectionsByLead.get(leadId).set(connectionId, { controller, connectionId });
        console.log(`[SSE Manager] ➕ Conexão ${connectionId} adicionada para o lead ${leadId}.`);
        // Enviar mensagem de confirmação
        try {
            const welcomeMessage = `data: ${JSON.stringify({
                type: 'connection',
                message: 'Conectado com sucesso',
                leadId,
                connectionId,
                timestamp: new Date().toISOString()
            })}\n\n`;
            controller.enqueue(welcomeMessage);
        }
        catch (error) {
            console.error('[SSE Manager] ❌ Erro ao enviar mensagem de boas-vindas:', error);
        }
        return connectionId;
    }
    removeConnection(leadId, connectionId) {
        const leadConnections = this.connectionsByLead.get(leadId);
        if (leadConnections?.delete(connectionId)) {
            console.log(`[SSE Manager] ➖ Conexão ${connectionId} removida.`);
            if (leadConnections.size === 0) {
                this.connectionsByLead.delete(leadId);
                // CORREÇÃO: Removida a condição 'if (this.isInitialized)' aqui também
                this.subscriber.unsubscribe(`sse:${leadId}`);
                console.log(`[SSE Redis] 🔌 Inscrição do canal sse:${leadId} cancelada.`);
            }
        }
    }
    async sendNotification(leadId, data) {
        if (!this.isInitialized) {
            console.error('[SSE Manager] ‼️ ERRO CRÍTICO: Publisher Redis não conectado. A notificação não será enviada.');
            return false;
        }
        try {
            const message = JSON.stringify({
                type: 'notification',
                leadId,
                data,
                timestamp: new Date().toISOString()
            });
            await this.publisher.publish(`sse:${leadId}`, message);
            console.log(`[SSE Redis] ✅ Notificação para ${leadId} publicada com sucesso.`);
            return true;
        }
        catch (error) {
            console.error(`[SSE Redis] ❌ Erro ao publicar notificação:`, error);
            return false;
        }
    }
    getConnectionsForLead(leadId) {
        const leadConnections = this.connectionsByLead.get(leadId);
        return leadConnections ? leadConnections.size : 0;
    }
    getConnectionsCount() {
        return Array.from(this.connectionsByLead.values())
            .reduce((total, leadConnections) => total + leadConnections.size, 0);
    }
    getStatus() {
        const leads = Array.from(this.connectionsByLead.keys());
        const leadCounts = leads.map(leadId => ({
            leadId,
            connections: this.connectionsByLead.get(leadId).size
        }));
        return {
            isRedisInitialized: this.isInitialized,
            totalConnections: this.getConnectionsCount(),
            leadsConnected: leads.length,
            connectionsPerLead: leadCounts
        };
    }
    async cleanup() {
        try {
            console.log('[SSE Manager] 🧹 Iniciando limpeza...');
            this.connectionsByLead.clear();
            if (this.isInitialized) {
                await this.subscriber.disconnect();
                await this.publisher.disconnect();
                console.log('[SSE Redis] ✅ Clientes Redis desconectados');
                this.isInitialized = false;
            }
            console.log('[SSE Manager] ✅ Limpeza concluída');
        }
        catch (error) {
            console.error('[SSE Manager] ❌ Erro durante limpeza:', error);
        }
    }
}
// --- Lógica do Singleton ---
exports.sseManager = globalForSse.sseManager || new SseManager();
if (process.env.NODE_ENV !== 'production') {
    globalForSse.sseManager = exports.sseManager;
}
// Função para limitar a mensagem SSE no log
function limitSSEMessageForLog(message) {
    try {
        const parsed = JSON.parse(message);
        if (parsed.data && parsed.data.leadData) {
            // Limitar os dados do lead para mostrar apenas campos básicos
            const { id, sourceId, name, nomeReal, phoneNumber } = parsed.data.leadData;
            return JSON.stringify({
                ...parsed,
                data: {
                    ...parsed.data,
                    leadData: { id, sourceId, name, nomeReal, phoneNumber, "...": "[outros campos omitidos]" }
                }
            }, null, 2);
        }
        return message;
    }
    catch {
        return message.substring(0, 200) + (message.length > 200 ? '...' : '');
    }
}
