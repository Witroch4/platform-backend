import { getRedisInstance } from '@/lib/connections';

// --- Interface da Conexão ---
interface SseConnection {
  controller: ReadableStreamDefaultController<string>;
  connectionId: string;
}

// --- Definição do Singleton no escopo global ---
// Isso garante que a mesma instância seja usada mesmo com o hot-reload do Next.js
const globalForSse = globalThis as unknown as {
  sseManager: SseManager | undefined;
};

// --- Classe SseManager ---
class SseManager {
  private connectionsByLead: Map<string, Map<string, SseConnection>> = new Map();
  private publisher!: ReturnType<typeof getRedisInstance>;
  private subscriber!: ReturnType<typeof getRedisInstance>;
  private isInitialized = false;

  constructor() {
    console.log('[SSE Manager] 🚀 Criando nova instância...');
    // Don't initialize Redis in constructor to avoid Edge Runtime issues
  }

  private initializeRedis() {
    if (this.isInitialized || this.publisher) {
      return; // Already initialized
    }

    try {
      // Usar singleton para publisher e subscriber
      // Nota: Para pub/sub, precisamos de instâncias separadas
      const baseRedis = getRedisInstance();
      
      console.log('[SSE Redis] ⚙️ Usando conexão singleton');

      // Clonar configuração para pub/sub
      this.publisher = baseRedis.duplicate();
      this.subscriber = baseRedis.duplicate();

      this.subscriber.on('message', this.handleRedisMessage.bind(this));
      
      this.publisher.on('connect', () => {
        console.log('[SSE Redis] ✅ Publisher conectado.');
        this.isInitialized = true;
      });

      this.subscriber.on('connect', () => console.log('[SSE Redis] ✅ Subscriber conectado.'));
      
      const handleError = (client: string) => (error: Error) => {
        console.error(`[SSE Redis] ❌ Erro no ${client}:`, error.message);
        if (client === 'publisher') this.isInitialized = false;
      };

      this.publisher.on('error', handleError('Publisher'));
      this.subscriber.on('error', handleError('Subscriber'));
    } catch (error) {
      console.error('[SSE Redis] ❌ Erro ao inicializar Redis:', error);
      // Don't throw error, just log it
    }
  }

  private handleRedisMessage(channel: string, message: string) {
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
      } catch (e) {
        console.warn(`[SSE Manager] ⚠️ Conexão ${conn.connectionId} fechada, removendo.`);
        this.removeConnection(leadId, conn.connectionId);
      }
    });
    
    // 🔇 Log apenas se houver falhas
    if (successCount !== leadConnections.size) {
      console.log(`[SSE Redis] 📊 Resumo: ${successCount}/${leadConnections.size} mensagens entregues`);
    }
  }

  public addConnection(leadId: string, controller: ReadableStreamDefaultController<string>): string {
    // Initialize Redis only when needed
    this.initializeRedis();
    
    const connectionId = `${leadId}-${Date.now()}`;
    
    if (!this.connectionsByLead.has(leadId)) {
      this.connectionsByLead.set(leadId, new Map());
      
      // Only subscribe if Redis is properly initialized
      if (this.subscriber) {
        this.subscriber.subscribe(`sse:${leadId}`, (err: any, count: any) => {
          if (err) {
            return console.error(`[SSE Redis] ❌ Falha ao se inscrever no canal sse:${leadId}`, err);
          }
          console.log(`[SSE Redis] 📡 Inscrição no canal sse:${leadId} confirmada. Total de inscrições nesta instância: ${count}`);
        });
      }
    }
    
    this.connectionsByLead.get(leadId)!.set(connectionId, { controller, connectionId });
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
    } catch (error) {
      console.error('[SSE Manager] ❌ Erro ao enviar mensagem de boas-vindas:', error);
    }
    
    return connectionId;
  }

  public removeConnection(leadId: string, connectionId: string): void {
    const leadConnections = this.connectionsByLead.get(leadId);
    if (leadConnections?.delete(connectionId)) {
      console.log(`[SSE Manager] ➖ Conexão ${connectionId} removida.`);
      if (leadConnections.size === 0) {
        this.connectionsByLead.delete(leadId);
        // Only unsubscribe if Redis is properly initialized
        if (this.subscriber) {
          this.subscriber.unsubscribe(`sse:${leadId}`);
          console.log(`[SSE Redis] 🔌 Inscrição do canal sse:${leadId} cancelada.`);
        }
      }
    }
  }

  public async sendNotification(leadId: string, data: any): Promise<boolean> {
    // Initialize Redis if not already done
    this.initializeRedis();
    
    if (!this.publisher || !this.isInitialized) {
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
    } catch (error) {
      console.error(`[SSE Redis] ❌ Erro ao publicar notificação:`, error);
      return false;
    }
  }

  public getConnectionsForLead(leadId: string): number {
    const leadConnections = this.connectionsByLead.get(leadId);
    return leadConnections ? leadConnections.size : 0;
  }

  public getConnectionsCount(): number {
    return Array.from(this.connectionsByLead.values())
      .reduce((total, leadConnections) => total + leadConnections.size, 0);
  }

  public getStatus() {
    const leads = Array.from(this.connectionsByLead.keys());
    const leadCounts = leads.map(leadId => ({
      leadId,
      connections: this.connectionsByLead.get(leadId)!.size
    }));

    return {
      isRedisInitialized: this.isInitialized,
      totalConnections: this.getConnectionsCount(),
      leadsConnected: leads.length,
      connectionsPerLead: leadCounts
    };
  }

  public async cleanup(): Promise<void> {
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
    } catch (error) {
      console.error('[SSE Manager] ❌ Erro durante limpeza:', error);
    }
  }
}

// --- Lógica do Singleton ---
export const sseManager = globalForSse.sseManager || new SseManager();

if (process.env.NODE_ENV !== 'production') {
  globalForSse.sseManager = sseManager;
}

// Função para limitar a mensagem SSE no log
function limitSSEMessageForLog(message: string) {
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
  } catch {
    return message.substring(0, 200) + (message.length > 200 ? '...' : '');
  }
} 