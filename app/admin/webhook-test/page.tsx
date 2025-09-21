"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Send,
  TestTube,
  Zap,
  Copy,
  CheckCircle,
  XCircle,
  Save,
  FolderOpen,
  Trash2,
  Link2,
  RefreshCw,
  Shield,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { quickReplyFBPayload } from "./quickReplyFBPayload";
import { quickReplyIGPayload } from "./paylod-quick-IG";
import { socialwiseWhatsappPayload } from "./socialwiseWhatsappPayload";
import { socialwiseWhatsappButtonPayload } from "./socialwiseWhatsappButtonPayload";
import { socialwiseInstagramPayload } from "./socialwiseInstagramPayload";
import { socialwiseInstagramButtonPayload } from "./socialwiseInstagramButtonPayload";
import { socialwiseFacebookPayload } from "./socialwiseFacebookPayload";

interface SavedPayload {
  id: string;
  name: string;
  payload: string;
  createdAt: string;
}

export default function WebhookTestPage() {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [customPayload, setCustomPayload] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("+558597550136");
  const [flashIntentStatus, setFlashIntentStatus] = useState<any>(null);
  const [savedPayloads, setSavedPayloads] = useState<SavedPayload[]>([]);
  const [payloadName, setPayloadName] = useState("");
  const [externalDest, setExternalDest] = useState<string>("");
  const [clearCache, setClearCache] = useState(true);
  const [clearingCache, setClearingCache] = useState(false);
  // Fonte única da verdade - apenas 2 campos principais
  const [userMessage, setUserMessage] = useState("");
  const [buttonPayload, setButtonPayload] = useState("");

  // Flag para controlar se já carregou do localStorage
  const [isLoaded, setIsLoaded] = useState(false);

  // Estados auxiliares mantidos para funcionalidade
  const [testCount, setTestCount] = useState(0);
  const [infiniteTestMode, setInfiniteTestMode] = useState(false);
  const [infiniteTestInterval, setInfiniteTestInterval] = useState(2000);
  const [infiniteTestRunning, setInfiniteTestRunning] = useState(false);
  const [idempotencyDisabled, setIdempotencyDisabled] = useState(false);
  const [idempotencyStatus, setIdempotencyStatus] = useState<any>(null);
  const [randomizeSourceId, setRandomizeSourceId] = useState(true);
  const [lastSentPayload, setLastSentPayload] = useState<any>(null);

  const DEFAULT_EXTERNAL_DEST =
    "https://moved-chigger-randomly.ngrok-free.app/api/integrations/webhooks/socialwiseflow";


  useEffect(() => {
    // Carregar status da Flash Intent
    const loadFlashIntentStatus = async () => {
      try {
        const response = await fetch(
          "/api/admin/resposta-rapida/global-status"
        );
        if (response.ok) {
          const data = await response.json();
          setFlashIntentStatus(data);
        }
      } catch (error) {
        console.error("Erro ao carregar status da Flash Intent:", error);
      }
    };

    // Carregar dados salvos PRIMEIRO
    try {
      const savedUserMessage = localStorage.getItem("webhook-user-message");
      const savedButtonPayload = localStorage.getItem("webhook-button-payload");
      const savedExternalDest = localStorage.getItem("webhook-external-dest");

      // Definir valores salvos ou padrões
      setUserMessage(savedUserMessage || "VCS SÃO ESPECIALISTAS?");
      setButtonPayload(savedButtonPayload || "btn_1754993780819_0_tqji");
      if (savedExternalDest) setExternalDest(savedExternalDest);
    } catch (error) {
      console.error("Erro ao carregar configurações:", error);
      // Valores padrão em caso de erro
      setUserMessage("VCS SÃO ESPECIALISTAS?");
      setButtonPayload("btn_1754993780819_0_tqji");
    }

    loadFlashIntentStatus();
    loadSavedPayloads();
    loadIdempotencyStatus();

    // Marcar como carregado após definir os valores iniciais
    setIsLoaded(true);
  }, []);

  // Salvar automaticamente os valores principais (só depois do carregamento inicial)
  useEffect(() => {
    if (isLoaded && userMessage.trim()) {
      try {
        localStorage.setItem("webhook-user-message", userMessage);
        console.log("💾 Mensagem salva:", userMessage);
      } catch (error) {
        console.error("Erro ao salvar mensagem do usuário:", error);
      }
    }
  }, [userMessage, isLoaded]);

  useEffect(() => {
    if (isLoaded && buttonPayload.trim()) {
      try {
        localStorage.setItem("webhook-button-payload", buttonPayload);
        console.log("💾 Payload salvo:", buttonPayload);
      } catch (error) {
        console.error("Erro ao salvar payload do botão:", error);
      }
    }
  }, [buttonPayload, isLoaded]);


  const loadSavedPayloads = () => {
    try {
      const saved = localStorage.getItem("webhook-saved-payloads");
      if (saved) {
        setSavedPayloads(JSON.parse(saved));
      }
    } catch (error) {
      console.error("Erro ao carregar payloads salvos:", error);
    }
  };

  const savePayload = () => {
    if (!customPayload.trim() || !payloadName.trim()) {
      toast.error("Nome e payload são obrigatórios");
      return;
    }

    try {
      // Validar se é JSON válido
      JSON.parse(customPayload);

      const newPayload: SavedPayload = {
        id: Date.now().toString(),
        name: payloadName.trim(),
        payload: customPayload,
        createdAt: new Date().toISOString(),
      };

      const updatedPayloads = [...savedPayloads, newPayload];
      setSavedPayloads(updatedPayloads);
      localStorage.setItem(
        "webhook-saved-payloads",
        JSON.stringify(updatedPayloads)
      );

      setPayloadName("");
      toast.success("Payload salvo com sucesso!");
    } catch (error) {
      toast.error("JSON inválido no payload");
    }
  };

  const loadPayload = (payload: SavedPayload) => {
    setCustomPayload(payload.payload);
    toast.success(`Payload "${payload.name}" carregado`);
  };

  const deletePayload = (id: string) => {
    const updatedPayloads = savedPayloads.filter((p) => p.id !== id);
    setSavedPayloads(updatedPayloads);
    localStorage.setItem(
      "webhook-saved-payloads",
      JSON.stringify(updatedPayloads)
    );
    toast.success("Payload removido");
  };

  const clearWebhookCache = async () => {
    try {
      setClearingCache(true);

      const response = await fetch("/api/admin/webhook-test/clear-cache", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message || "Cache limpo com sucesso!");
        return true;
      } else {
        toast.error(data.error || "Erro ao limpar cache");
        return false;
      }
    } catch (error) {
      console.error("Erro ao limpar cache:", error);
      toast.error("Erro ao limpar cache");
      return false;
    } finally {
      setClearingCache(false);
    }
  };

  const startInfiniteTest = async () => {
    if (infiniteTestRunning) return;
    
    setInfiniteTestRunning(true);
    setInfiniteTestMode(true);
    
    const runTest = async () => {
      if (!infiniteTestRunning) return;
      
      try {
        // Limpar cache antes de cada teste se habilitado
        if (clearCache) {
          await clearWebhookCache();
        }
        
        // Executar o teste
        await sendWebhookTest(realPayload);
        setTestCount(prev => prev + 1);
        
        // Agendar próximo teste
        setTimeout(runTest, infiniteTestInterval);
      } catch (error) {
        console.error("Erro no teste infinito:", error);
        toast.error("Erro no teste infinito");
        stopInfiniteTest();
      }
    };
    
    runTest();
  };

  const stopInfiniteTest = () => {
    setInfiniteTestRunning(false);
    setInfiniteTestMode(false);
  };

  const loadIdempotencyStatus = async () => {
    try {
      const response = await fetch("/api/admin/webhook-test/disable-idempotency");
      if (response.ok) {
        const data = await response.json();
        setIdempotencyStatus(data);
        setIdempotencyDisabled(data.disabled);
      }
    } catch (error) {
      console.error("Erro ao carregar status da idempotência:", error);
    }
  };

  const toggleIdempotency = async (disable: boolean) => {
    try {
      const response = await fetch("/api/admin/webhook-test/disable-idempotency", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          disable,
          duration: disable ? 300 : 0 // 5 minutos quando desabilitar
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setIdempotencyStatus(data);
        setIdempotencyDisabled(data.disabled);
        toast.success(data.message);
      } else {
        toast.error("Erro ao controlar idempotência");
      }
    } catch (error) {
      console.error("Erro ao controlar idempotência:", error);
      toast.error("Erro ao controlar idempotência");
    }
  };

  useEffect(() => {
    // Parar teste infinito quando componente for desmontado
    return () => {
      stopInfiniteTest();
    };
  }, []);

  // Payload real do Dialogflow fornecido pelo usuário
  const realPayload = {
    responseId: "db6513de-92fd-49d8-a59b-9224263932c6-6583c630",
    queryResult: {
      queryText: "Finalizar",
      parameters: {
        person: "",
      },
      allRequiredParamsPresent: true,
      fulfillmentText:
        "Estarei disponível para ajudar quando precisar. 🌟 Tenha um dia maravilhoso e saiba que pode contar comigo sempre que necessário. 👋🏼",
      fulfillmentMessages: [
        {
          text: {
            text: [
              "Estarei disponível para ajudar quando precisar. 🌟 Tenha um dia maravilhoso e saiba que pode contar comigo sempre que necessário. 👋🏼",
            ],
          },
        },
      ],
      intent: {
        name: "projects/msjudicialoab-rxtd/agent/intents/253e32e2-8922-406c-96f5-c669ed4e92c0",
        displayName: "Finalizar",
        endInteraction: true,
      },
      intentDetectionConfidence: 1,
      languageCode: "pt-br",
    },
    originalDetectIntentRequest: {
      payload: {
        conversation_id: 1988,
        conversation_created_at: "2025-07-25T00:21:51Z",
        whatsapp_api_key:
          "EAAGIBII4GXQBO2qgvJ2jdcUmgkdqBo5bUKEanJWmCLpcZAsq0Ovpm4JNlrNLeZAv3OYNrdCqqQBAHfEfPFD0FPnZAOQJURB9GKcbjXeDpa83XdAsa3i6fTr23lBFM2LwUZC23xXrZAnB8QjCCFZBxrxlBvzPj8LsejvUjz0C04Q8Jsl8nTGHUd4ZBRPc4NiHFnc",
        contact_identifier: "",
        list_id: "",
        has_whatsapp_api_key: true,
        interaction_type: "button_reply",
        account_name: "DraAmandaSousa",
        is_whatsapp_channel: true,
        message_id: 32930,
        message_type: "incoming",
        button_title: "Finalizar",
        contact_phone: "+558597550136",
        conversation_updated_at: "2025-07-26T21:53:59Z",
        business_id: "294585820394901",
        inbox_id: 4,
        wamid: "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0E3QThCOEY0MzUwRUVDNkQ4RTAA",
        phone_number_id: "274633962398273",
        contact_email: "",
        contact_id: 1447,
        message_content: "Finalizar",
        message_created_at: "2025-07-26T21:53:59Z",
        inbox_name: "WhatsApp - ANA",
        conversation_assignee_id: 3,
        message_content_type: "text",
        account_id: 3,
        payload_version: "2.0",
        channel_type: "Channel::Whatsapp",
        list_title: "",
        conversation_status: "pending",
        button_id: "btn_1753326794020_tbc27gtbw",
        contact_name: "Witalo Rocha",
        timestamp: "2025-07-26T21:54:00Z",
        socialwise_active: true,
        list_description: "",
        contact_source: "558597550136",
      },
    },
    session: "projects/msjudicialoab-rxtd/agent/sessions/558597550136",
  };

  const sendWebhookTest = async (payload: any) => {
    try {
      setLoading(true);
      setResponse(null);

      // Gerar source_id aleatório se habilitado
      const finalSourceId = randomizeSourceId
        ? generateRandomSourceId('whatsapp')
        : "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FCNDNFNUMzMTJGQjc5RjcyOEQA";

      // Atualizar o número de telefone e source_id no payload se foi modificado
      const updatedPayload = {
        ...payload,
        originalDetectIntentRequest: {
          ...payload.originalDetectIntentRequest,
          payload: {
            ...payload.originalDetectIntentRequest.payload,
            contact_phone: phoneNumber,
            contact_source: phoneNumber.replace("+", ""),
            wamid: finalSourceId,
          },
        },
        session: `projects/msjudicialoab-rxtd/agent/sessions/${phoneNumber.replace("+", "")}`,
      };

      // Salvar o payload que está sendo enviado para debug
      setLastSentPayload(updatedPayload);

      console.log("Enviando payload para webhook:", updatedPayload);

      const response = await fetch("/api/admin/webhook-test/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payload: updatedPayload,
          phoneNumber: phoneNumber,
          clearCache: clearCache,
        }),
      });

      const responseData = await response.json();

      if (responseData.success && responseData.webhook) {
        setResponse({
          status: responseData.webhook.status,
          statusText: responseData.webhook.statusText,
          headers: responseData.webhook.headers,
          data: responseData.webhook.data,
          responseTime: responseData.webhook.responseTime,
          testInfo: responseData.test,
          cacheInfo: responseData.cache,
          timestamp: new Date().toISOString(),
        });
      } else {
        setResponse({
          status: response.status,
          statusText: response.statusText,
          data: responseData,
          cacheInfo: responseData.cache,
          timestamp: new Date().toISOString(),
        });
      }

      if (response.ok) {
        toast.success("Webhook enviado com sucesso!");
      } else {
        toast.error(
          `Erro no webhook: ${response.status} ${response.statusText}`
        );
      }
    } catch (error) {
      console.error("Erro ao enviar webhook:", error);
      toast.error("Erro ao enviar webhook");
      setResponse({
        error: error instanceof Error ? error.message : "Erro desconhecido",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  const sendRealPayload = () => {
    sendWebhookTest(realPayload);
  };

  const sendCustomPayload = () => {
    try {
      const payload = JSON.parse(customPayload);
      // Salvar o payload customizado que está sendo enviado
      setLastSentPayload(payload);
      sendWebhookTest(payload);
    } catch (error) {
      toast.error("JSON inválido no payload customizado");
    }
  };

  const copyPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(realPayload, null, 2));
    toast.success("Payload copiado para a área de transferência");
  };

  const createIntentPayload = () => {
    const intentPayload = {
      ...realPayload,
      queryResult: {
        ...realPayload.queryResult,
        queryText: "Olá",
        intent: {
          name: "projects/msjudicialoab-rxtd/agent/intents/welcome-intent",
          displayName: "Welcome",
          endInteraction: false,
        },
      },
      originalDetectIntentRequest: {
        ...realPayload.originalDetectIntentRequest,
        payload: {
          ...realPayload.originalDetectIntentRequest.payload,
          interaction_type: "intent",
          button_title: "",
          button_id: "",
          message_content: "Olá",
        },
      },
    };
    sendWebhookTest(intentPayload);
  };

  // ---------- Integração: Destino Customizado (SocialwiseFlow) ----------
  const getExternalDestination = () =>
    externalDest.trim() || DEFAULT_EXTERNAL_DEST;

  // Função para gerar Source ID aleatório baseada no tipo de plataforma
  const generateRandomSourceId = (type: 'whatsapp' | 'instagram' | 'facebook') => {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 15);

    switch (type) {
      case 'whatsapp':
        const whatsappBase = Math.random().toString().substring(2, 15);
        const whatsappSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `wamid.HBgM${whatsappBase}FQIAEhgU${whatsappSuffix}`;
      case 'instagram':
        return `ig_${timestamp}_${random}`;
      case 'facebook':
        return `m_${random}${timestamp.substring(-8)}`;
      default:
        return random;
    }
  };

  // Função para gerar session ID aleatório para Facebook
  const generateRandomFacebookSessionId = () => {
    return Math.floor(Math.random() * 9000000000000000 + 1000000000000000).toString();
  };

  // FONTE ÚNICA DA VERDADE: Funções que usam apenas userMessage e buttonPayload
  const createWhatsappTextPayload = () => {
    const payload = JSON.parse(JSON.stringify(socialwiseWhatsappPayload));
    const finalSourceId = randomizeSourceId ? generateRandomSourceId('whatsapp') : "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FCNDNFNUMzMTJGQjc5RjcyOEQA";

    payload.message = userMessage;
    payload.context.message.content = userMessage;
    payload.context.message.processed_message_content = userMessage;
    payload.context.message_content = userMessage;
    payload.context.contact_phone = phoneNumber;
    payload.context.contact_source = phoneNumber.replace("+", "");
    payload.session_id = phoneNumber.replace("+", "");
    payload.context.message.source_id = finalSourceId;
    payload.context["socialwise-chatwit"].contact_data.phone_number = phoneNumber;
    payload.context["socialwise-chatwit"].whatsapp_identifiers.contact_source = phoneNumber.replace("+", "");
    return payload;
  };

  const createWhatsappButtonPayload = () => {
    const payload = JSON.parse(JSON.stringify(socialwiseWhatsappButtonPayload));
    const finalSourceId = randomizeSourceId ? generateRandomSourceId('whatsapp') : "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FCNDNFNUMzMTJGQjc5RjcyOEQA";

    payload.message = userMessage;
    payload.context.message.content = userMessage;
    payload.context.message.processed_message_content = userMessage;
    payload.context.message.content_attributes.button_reply.id = buttonPayload;
    payload.context.message.content_attributes.button_reply.title = userMessage;
    payload.context.message.content_attributes.interactive_payload.button_reply.id = buttonPayload;
    payload.context.message.content_attributes.interactive_payload.button_reply.title = userMessage;
    payload.context["socialwise-chatwit"].message_data.interactive_data.button_id = buttonPayload;
    payload.context["socialwise-chatwit"].message_data.interactive_data.button_title = userMessage;
    payload.context.button_id = buttonPayload;
    payload.context.button_title = userMessage;
    payload.context.contact_phone = phoneNumber;
    payload.context.contact_source = phoneNumber.replace("+", "");
    payload.session_id = phoneNumber.replace("+", "");
    payload.context.message.source_id = finalSourceId;
    payload.context["socialwise-chatwit"].contact_data.phone_number = phoneNumber;
    payload.context["socialwise-chatwit"].whatsapp_identifiers.contact_source = phoneNumber.replace("+", "");
    return payload;
  };

  const createInstagramTextPayload = () => {
    const payload = JSON.parse(JSON.stringify(socialwiseInstagramPayload));
    const finalSourceId = randomizeSourceId ? generateRandomSourceId('instagram') : payload.context.message.source_id;

    payload.message = userMessage;
    payload.context.message.content = userMessage;
    payload.context.message.processed_message_content = userMessage;
    payload.context.message_content = userMessage;
    payload.context.message.source_id = finalSourceId;
    return payload;
  };

  const createInstagramButtonPayload = () => {
    const payload = JSON.parse(JSON.stringify(socialwiseInstagramButtonPayload));
    const finalSourceId = randomizeSourceId ? generateRandomSourceId('instagram') : payload.context.message.source_id;

    payload.message = userMessage;
    payload.context.message.content = userMessage;
    payload.context.message.processed_message_content = userMessage;
    payload.context.message.content_attributes.postback_payload = buttonPayload;
    payload.context["socialwise-chatwit"].message_data.instagram_data.postback_payload = buttonPayload;
    payload.context.interaction_type = "postback";
    payload.context.postback_payload = buttonPayload;
    payload.context.message.source_id = finalSourceId;
    return payload;
  };

  const createFacebookTextPayload = () => {
    const payload = JSON.parse(JSON.stringify(socialwiseFacebookPayload));
    const finalSessionId = generateRandomFacebookSessionId();
    const finalSourceId = randomizeSourceId ? generateRandomSourceId('facebook') : payload.context.message.source_id;

    payload.message = userMessage;
    payload.session_id = finalSessionId;
    payload.context.message.content = userMessage;
    payload.context.message.processed_message_content = userMessage;
    payload.context.message_content = userMessage;
    payload.context.message.source_id = finalSourceId;
    payload.context.contact_source = finalSessionId;
    payload.context["socialwise-chatwit"].whatsapp_identifiers.contact_source = finalSessionId;
    payload.wamid = finalSourceId;
    return payload;
  };

  const createFacebookQuickReplyPayload = () => {
    const payload = JSON.parse(JSON.stringify(quickReplyFBPayload));
    const finalSessionId = generateRandomFacebookSessionId();
    const finalSourceId = randomizeSourceId ? generateRandomSourceId('facebook') : payload.context.message.source_id;

    payload.message = userMessage;
    payload.session_id = finalSessionId;
    payload.context.message.content = userMessage;
    payload.context.message.processed_message_content = userMessage;
    payload.context.message_content = userMessage;
    payload.context.message.source_id = finalSourceId;
    payload.context.contact_source = finalSessionId;
    payload.context.message.content_attributes.quick_reply_payload = buttonPayload;
    payload.context["socialwise-chatwit"].message_data.instagram_data.quick_reply_payload = buttonPayload;
    payload.quick_reply_payload = buttonPayload;
    return payload;
  };

  const createInstagramQuickReplyPayload = () => {
    const payload = JSON.parse(JSON.stringify(quickReplyIGPayload));
    const finalSourceId = randomizeSourceId ? generateRandomSourceId('instagram') : payload.context.message.source_id;

    payload.message = userMessage;
    payload.context.message.content = userMessage;
    payload.context.message.processed_message_content = userMessage;
    payload.context.message_content = userMessage;
    payload.context.message.source_id = finalSourceId;
    payload.context.message.content_attributes.quick_reply_payload = buttonPayload;
    payload.context["socialwise-chatwit"].message_data.instagram_data.quick_reply_payload = buttonPayload;
    payload.quick_reply_payload = buttonPayload;
    return payload;
  };

  const sendToExternal = async (payload: any) => {
    try {
      setLoading(true);
      setResponse(null);

      // Salvar o payload que está sendo enviado para debug
      setLastSentPayload(payload);

      const dest = getExternalDestination();
      try {
        localStorage.setItem("webhook-external-dest", externalDest);
      } catch {}

      const res = await fetch(dest, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = await res.text();
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        data,
        timestamp: new Date().toISOString(),
        target: dest,
      });

      if (res.ok) toast.success("Enviado ao destino customizado com sucesso");
      else
        toast.error(
          `Erro ao enviar ao destino: ${res.status} ${res.statusText}`
        );
    } catch (error) {
      console.error("Erro no envio externo:", error);
      toast.error("Erro ao enviar ao destino customizado");
      setResponse({
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  // Payloads padrão (SocialwiseFlow) - versões completas já importadas dos arquivos separados

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TestTube className="h-8 w-8 text-blue-500" />
          <div>
            <h1 className="text-3xl font-bold">Teste de Webhook</h1>
            <p className="text-muted-foreground">
              Teste webhooks do Dialogflow e SocialWise Flow
            </p>
          </div>
        </div>
        
        {/* Botão de limpeza rápida de cache */}
        <div className="flex items-center gap-2">
          <Button
            onClick={clearWebhookCache}
            disabled={clearingCache}
            variant="outline"
            
            className="flex items-center gap-2"
          >
            {clearingCache ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {clearingCache ? "Limpando..." : "Limpar Cache"}
          </Button>
          
          {infiniteTestRunning && (
            <Badge variant="destructive" className="animate-pulse">
              Teste Infinito Ativo
            </Badge>
          )}
        </div>
      </div>

      {/* Status da Flash Intent */}
      {flashIntentStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Status da Flash Intent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {flashIntentStatus.enabled ? (
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Ativa
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" />
                  Inativa
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                {flashIntentStatus.enabled
                  ? `Processando ${flashIntentStatus.stats?.total_processed || 0} mensagens`
                  : "Sistema desabilitado"}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configurações */}
      <Card>
        <CardHeader>
          <CardTitle>Configurações do Teste</CardTitle>
          <CardDescription>
            Configure o número de telefone que receberá a mensagem de teste e um
            destino externo opcional
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label htmlFor="phone" className="text-sm font-medium">
                Número de Telefone (com código do país)
              </label>
              <Input
                id="phone"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+5511999999999"
                className="max-w-md"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Este número receberá a mensagem de teste do WhatsApp
              </p>
            </div>

            {/* Controle de Cache */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="clearCache"
                  checked={clearCache}
                  onChange={(e) => setClearCache(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="clearCache" className="text-sm font-medium">
                  Limpar cache antes do teste
                </label>
                <p className="text-xs text-muted-foreground">
                  (Recomendado para testes mais precisos)
                </p>
              </div>

              {/* Botão para limpar cache manualmente */}
              <div className="flex items-center gap-2">
                <Button
                  onClick={clearWebhookCache}
                  disabled={clearingCache}
                  variant="outline"
                  
                  className="flex items-center gap-2"
                >
                  {clearingCache ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {clearingCache ? "Limpando..." : "Limpar Cache Agora"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Remove cache de duplicatas, rate limiting e idempotência
                </p>
              </div>
            </div>

            {/* Controle de Idempotência */}
            <div className="space-y-3 border-t pt-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" /> Controle de Idempotência
              </h4>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="disableIdempotency"
                    checked={idempotencyDisabled}
                    onChange={(e) => toggleIdempotency(e.target.checked)}
                    className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                  />
                  <label htmlFor="disableIdempotency" className="text-sm font-medium">
                    Desabilitar detecção de duplicatas
                  </label>
                </div>
                
                {idempotencyStatus && (
                  <div className="flex items-center gap-2">
                    <Badge variant={idempotencyDisabled ? "destructive" : "secondary"}>
                      {idempotencyDisabled ? "Desabilitada" : "Habilitada"}
                    </Badge>
                    {idempotencyStatus.ttl && (
                      <span className="text-xs text-muted-foreground">
                        Expira em {Math.ceil(idempotencyStatus.ttl / 60)}min
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              <p className="text-xs text-muted-foreground">
                ⚠️ Desabilitar permite enviar mensagens duplicadas para testes. Reabilita automaticamente em 5 minutos.
              </p>
            </div>

            {/* Modo de Teste Infinito */}
            <div className="space-y-3 border-t pt-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4" /> Modo de Teste Infinito
              </h4>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="infiniteTestMode"
                    checked={infiniteTestMode}
                    onChange={(e) => setInfiniteTestMode(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="infiniteTestMode" className="text-sm font-medium">
                    Ativar teste infinito
                  </label>
                </div>
                
                <div className="flex items-center gap-2">
                  <label htmlFor="testInterval" className="text-xs text-muted-foreground">
                    Intervalo (ms):
                  </label>
                  <Input
                    id="testInterval"
                    type="number"
                    value={infiniteTestInterval}
                    onChange={(e) => setInfiniteTestInterval(Number(e.target.value))}
                    min="500"
                    max="30000"
                    step="500"
                    className="w-20 h-8 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Button
                  onClick={startInfiniteTest}
                  disabled={infiniteTestRunning || !infiniteTestMode}
                  variant="destructive"
                  
                  className="flex items-center gap-2"
                >
                  {infiniteTestRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  {infiniteTestRunning ? "Teste Infinito Ativo..." : "Iniciar Teste Infinito"}
                </Button>
                
                <Button
                  onClick={stopInfiniteTest}
                  disabled={!infiniteTestRunning}
                  variant="outline"
                  
                  className="flex items-center gap-2"
                >
                  <XCircle className="h-4 w-4" />
                  Parar Teste
                </Button>
                
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    Testes: {testCount}
                  </Badge>
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground">
                ⚠️ Use com cuidado! O teste infinito enviará webhooks continuamente até ser parado.
              </p>
            </div>

            {/* Destino customizado */}
            <div>
              <label
                htmlFor="externalDest"
                className="text-sm font-medium flex items-center gap-2"
              >
                <Link2 className="h-4 w-4" /> Destino customizado (opcional)
              </label>
              <Input
                id="externalDest"
                value={externalDest}
                onChange={(e) => setExternalDest(e.target.value)}
                placeholder={DEFAULT_EXTERNAL_DEST}
                className="max-w-2xl"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Se vazio, usaremos o padrão: {DEFAULT_EXTERNAL_DEST}
              </p>
            </div>

            {/* FONTE ÚNICA DA VERDADE - Apenas 2 campos principais */}
            <div className="space-y-4 border-t pt-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <TestTube className="h-4 w-4" />
                Fonte Única da Verdade
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="userMessage" className="text-sm font-medium">
                    Mensagem do usuário (ou título do botão)
                  </label>
                  <div className="flex gap-2 items-center">
                    <Input
                      id="userMessage"
                      value={userMessage}
                      onChange={(e) => setUserMessage(e.target.value)}
                      placeholder="VCS SÃO ESPECIALISTAS?"
                      className="max-w-md"
                    />
                    <Button
                      variant="ghost"
                      
                      onClick={() => {
                        setUserMessage("");
                        try {
                          localStorage.removeItem("webhook-user-message");
                        } catch {}
                      }}
                      className="h-8 w-8 p-0"
                      title="Limpar mensagem"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Usado em TODOS os payloads como mensagem ou título do botão • <span className="text-green-600">Salvo automaticamente ao digitar</span>
                  </p>
                </div>

                <div>
                  <label htmlFor="buttonPayload" className="text-sm font-medium">
                    Payload do Botão
                  </label>
                  <div className="flex gap-2 items-center">
                    <Input
                      id="buttonPayload"
                      value={buttonPayload}
                      onChange={(e) => setButtonPayload(e.target.value)}
                      placeholder="btn_1754993780819_0_tqji"
                      className="max-w-md"
                    />
                    <Button
                      variant="ghost"
                      
                      onClick={() => {
                        setButtonPayload("");
                        try {
                          localStorage.removeItem("webhook-button-payload");
                        } catch {}
                      }}
                      className="h-8 w-8 p-0"
                      title="Limpar payload"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Usado em TODOS os botões (WhatsApp, Instagram, Facebook) • <span className="text-green-600">Salvo automaticamente ao digitar</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="randomizeSourceId"
                  checked={randomizeSourceId}
                  onChange={(e) => setRandomizeSourceId(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="randomizeSourceId" className="text-sm">
                  Randomizar Source IDs automaticamente (recomendado para testes)
                </label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Testes Rápidos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Payload Real
            </CardTitle>
            <CardDescription>
              Envia o payload real do Dialogflow
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={sendRealPayload}
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Enviar Payload Real
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5 text-blue-500" />
              Intent Teste
            </CardTitle>
            <CardDescription>Simula uma intent de boas-vindas</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={createIntentPayload}
              disabled={loading}
              variant="outline"
              className="w-full"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Testar Intent
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5 text-green-500" />
              Copiar Payload
            </CardTitle>
            <CardDescription>
              Copia o payload para área de transferência
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={copyPayload}
              variant="secondary"
              className="w-full"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copiar JSON
            </Button>
          </CardContent>
        </Card>
      </div>


      {/* Enviar para destino customizado (cargas padrão) */}
      <Card>
        <CardHeader>
          <CardTitle>Cargas padrão para destino customizado</CardTitle>
          <CardDescription>
            Envie payloads do SocialWise Flow para o destino customizado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h5 className="text-sm font-medium">WhatsApp</h5>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => sendToExternal(createWhatsappTextPayload())}
                  disabled={loading}
                  variant="outline"
                  
                >
                  Texto Simples
                </Button>
                <Button
                  onClick={() => sendToExternal(createWhatsappButtonPayload())}
                  disabled={loading}
                  variant="outline"
                  
                >
                  Com Botão
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <h5 className="text-sm font-medium">Instagram</h5>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => sendToExternal(createInstagramTextPayload())}
                  disabled={loading}
                  variant="outline"
                  
                >
                  Texto Simples
                </Button>
                <Button
                  onClick={() => sendToExternal(createInstagramButtonPayload())}
                  disabled={loading}
                  variant="outline"
                  
                >
                  Com Botão
                </Button>
                <Button
                  onClick={() => sendToExternal(createInstagramQuickReplyPayload())}
                  disabled={loading}
                  variant="outline"
                  
                >
                  Quick Reply
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <h5 className="text-sm font-medium">Facebook Page</h5>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => sendToExternal(createFacebookTextPayload())}
                  disabled={loading}
                  variant="outline"
                  
                >
                  Texto Simples
                </Button>
                <Button
                  onClick={() => sendToExternal(createFacebookQuickReplyPayload())}
                  disabled={loading}
                  variant="outline"
                  
                >
                  Quick Reply
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payload Customizado */}
      <Card>
        <CardHeader>
          <CardTitle>Payload Customizado</CardTitle>
          <CardDescription>
            Cole seu próprio payload JSON para teste
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Nome do payload"
                value={payloadName}
                onChange={(e) => setPayloadName(e.target.value)}
                className="max-w-xs"
              />
              <Button onClick={savePayload} variant="outline" >
                <Save className="h-4 w-4 mr-2" />
                Salvar
              </Button>
            </div>

            <Textarea
              placeholder="Cole seu payload JSON aqui..."
              value={customPayload}
              onChange={(e) => setCustomPayload(e.target.value)}
              className="min-h-[200px] font-mono text-sm"
            />

            <div className="flex gap-2">
              <Button
                onClick={sendCustomPayload}
                disabled={loading || !customPayload.trim()}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Enviar Payload Customizado
              </Button>

              <Button
                onClick={() =>
                  sendToExternal(JSON.parse(customPayload || "{}"))
                }
                disabled={loading || !customPayload.trim()}
                variant="outline"
              >
                Enviar para Destino Customizado
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payloads Salvos */}
      {savedPayloads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-blue-500" />
              Payloads Salvos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {savedPayloads.map((payload) => (
                <div
                  key={payload.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{payload.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Salvo em {new Date(payload.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => loadPayload(payload)}
                      variant="outline"
                      
                    >
                      Carregar
                    </Button>
                    <Button
                      onClick={() => deletePayload(payload.id)}
                      variant="outline"
                      
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resposta do Webhook */}
      {response && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Resposta do Webhook
              {response.status && (
                <Badge
                  variant={response.status < 400 ? "default" : "destructive"}
                >
                  {response.status} {response.statusText}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {response.responseTime && (
                <div className="text-sm">
                  <strong>Tempo de resposta:</strong> {response.responseTime}ms
                </div>
              )}

              {response.target && (
                <div className="text-sm">
                  <strong>Destino:</strong> {response.target}
                </div>
              )}

              {response.testInfo && (
                <div className="text-sm">
                  <strong>Info do teste:</strong>{" "}
                  {JSON.stringify(response.testInfo, null, 2)}
                </div>
              )}

              {response.cacheInfo && (
                <div className="text-sm">
                  <strong>Cache:</strong>{" "}
                  {JSON.stringify(response.cacheInfo, null, 2)}
                </div>
              )}

              <div>
                <strong>Resposta:</strong>
                <pre className="mt-2 p-4 bg-muted rounded-lg text-sm overflow-auto max-h-96">
                  {JSON.stringify(response.data || response.error, null, 2)}
                </pre>
              </div>

              <div className="text-xs text-muted-foreground">
                Timestamp: {response.timestamp}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Informações do Payload */}
      <Card>
        <CardHeader>
          <CardTitle>Informações do Payload Real</CardTitle>
          <CardDescription>
            {lastSentPayload 
              ? "Último payload enviado para teste (com modificações aplicadas)"
              : "Estrutura do payload base (será modificado antes do envio)"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">
            {JSON.stringify(lastSentPayload || realPayload, null, 2)}
          </pre>
          {lastSentPayload && (
            <div className="flex items-center gap-2 mt-3">
              <Badge variant="secondary" className="text-xs">
                Payload Enviado
              </Badge>
              <p className="text-xs text-muted-foreground">
                Este payload inclui modificações como source_id randomizado, telefone personalizado, etc.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
