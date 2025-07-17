"use strict";
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSSENotifications = useSSENotifications;
const react_1 = require("react");
const sonner_1 = require("sonner");
function useSSENotifications({ leadId, enabled = true, onNotification, onError, onConnect, onDisconnect }) {
    const [isConnected, setIsConnected] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    const eventSourceRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        if (!enabled || !leadId) {
            // Fechar conexão existente se SSE foi desabilitado
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
                setIsConnected(false);
            }
            return;
        }
        // Evitar múltiplas conexões para o mesmo lead
        if (eventSourceRef.current) {
            console.log(`[SSE Hook] Conexão já existe para leadId: ${leadId}, não criando nova`);
            return;
        }
        let reconnectTimeoutId = null;
        let isComponentMounted = true;
        const connectSSE = () => {
            if (!isComponentMounted || !enabled)
                return;
            try {
                console.log(`[SSE Hook] Conectando ao SSE para leadId: ${leadId}`);
                const eventSource = new EventSource(`/api/admin/leads-chatwit/notifications?leadId=${leadId}`);
                eventSourceRef.current = eventSource;
                eventSource.onopen = () => {
                    if (!isComponentMounted)
                        return;
                    console.log(`[SSE Hook] Conexão estabelecida para leadId: ${leadId}`);
                    setIsConnected(true);
                    setError(null);
                    onConnect?.();
                };
                eventSource.addEventListener('connected', (event) => {
                    if (!isComponentMounted)
                        return;
                    try {
                        const data = JSON.parse(event.data);
                        console.log('[SSE Hook] Evento de conexão:', data.message);
                    }
                    catch (error) {
                        console.error('[SSE Hook] Erro ao processar evento de conexão:', error);
                    }
                });
                eventSource.onmessage = (event) => {
                    if (!isComponentMounted)
                        return;
                    try {
                        const notification = JSON.parse(event.data);
                        console.log('[SSE Hook] Notificação recebida:', notification);
                        // Chamar callback personalizado se fornecido
                        onNotification?.(notification);
                        // Exibir toast com a notificação
                        sonner_1.toast.success('📥 Atualização do Lead!', {
                            description: notification.message,
                            duration: 5000,
                            action: {
                                label: 'Fechar',
                                onClick: () => { },
                            },
                        });
                    }
                    catch (error) {
                        console.error('[SSE Hook] Erro ao processar notificação:', error);
                        sonner_1.toast.error('Erro ao processar notificação');
                    }
                };
                eventSource.onerror = (event) => {
                    if (!isComponentMounted)
                        return;
                    console.error('[SSE Hook] Erro na conexão SSE:', event);
                    setIsConnected(false);
                    setError('Erro na conexão com notificações em tempo real');
                    onError?.(event);
                    // Fechar conexão atual
                    if (eventSourceRef.current) {
                        eventSourceRef.current.close();
                        eventSourceRef.current = null;
                    }
                    // Tentar reconectar após um delay, mas apenas se ainda habilitado
                    if (enabled && isComponentMounted) {
                        console.log('[SSE Hook] Agendando reconexão em 10 segundos...');
                        reconnectTimeoutId = setTimeout(() => {
                            if (enabled && isComponentMounted) {
                                console.log('[SSE Hook] Tentando reconectar...');
                                connectSSE();
                            }
                        }, 10000); // Aumentar delay para 10 segundos
                    }
                };
            }
            catch (error) {
                console.error('[SSE Hook] Erro ao estabelecer conexão SSE:', error);
                setError('Falha ao conectar com notificações em tempo real');
            }
        };
        connectSSE();
        // Cleanup ao desmontar o componente
        return () => {
            console.log(`[SSE Hook] Limpando conexão SSE para leadId: ${leadId}`);
            isComponentMounted = false;
            // Cancelar timeout de reconexão
            if (reconnectTimeoutId) {
                clearTimeout(reconnectTimeoutId);
            }
            // Fechar conexão SSE
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            setIsConnected(false);
            onDisconnect?.();
        };
    }, [leadId, enabled]); // Remover callbacks das dependências para evitar re-renders
    // Função para reconectar manualmente
    const reconnect = () => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        setIsConnected(false);
        setError(null);
    };
    return {
        isConnected,
        error,
        reconnect
    };
}
