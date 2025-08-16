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
} from "lucide-react";
import { Input } from "@/components/ui/input";

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
  const [buttonId, setButtonId] = useState("btn_1754993780819_0_tqji");
  const [buttonTitle, setButtonTitle] = useState("Falar com a Dra");
  const [userMessage, setUserMessage] = useState("Queria saber mais sobre o mandado de segurança da OAB");
  const [instagramButtonId, setInstagramButtonId] = useState("ig_btn_1755004696546_uekaa4clu");

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

    loadFlashIntentStatus();
    loadSavedPayloads();
    try {
      const savedDest = localStorage.getItem("webhook-external-dest");
      if (savedDest) setExternalDest(savedDest);
    } catch {}
  }, []);

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
      } else {
        toast.error(data.error || "Erro ao limpar cache");
      }
    } catch (error) {
      console.error("Erro ao limpar cache:", error);
      toast.error("Erro ao limpar cache");
    } finally {
      setClearingCache(false);
    }
  };

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

      // Atualizar o número de telefone no payload se foi modificado
      const updatedPayload = {
        ...payload,
        originalDetectIntentRequest: {
          ...payload.originalDetectIntentRequest,
          payload: {
            ...payload.originalDetectIntentRequest.payload,
            contact_phone: phoneNumber,
            contact_source: phoneNumber.replace("+", ""),
          },
        },
        session: `projects/msjudicialoab-rxtd/agent/sessions/${phoneNumber.replace("+", "")}`,
      };

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

  // Funções para criar payloads personalizados
  const createCustomWhatsappPayload = () => {
    const payload = JSON.parse(JSON.stringify(socialwiseWhatsappPayload));
    payload.message = userMessage;
    payload.context.message.content = userMessage;
    payload.context.message.processed_message_content = userMessage;
    payload.context.message_content = userMessage;
    payload.context.contact_phone = phoneNumber;
    payload.context.contact_source = phoneNumber.replace("+", "");
    payload.session_id = phoneNumber.replace("+", "");
    payload.context["socialwise-chatwit"].contact_data.phone_number = phoneNumber;
    payload.context["socialwise-chatwit"].whatsapp_identifiers.contact_source = phoneNumber.replace("+", "");
    return payload;
  };

  const createCustomWhatsappButtonPayload = () => {
    const payload = JSON.parse(JSON.stringify(socialwiseWhatsappButtonPayload));
    payload.message = buttonTitle;
    payload.context.message.content = buttonTitle;
    payload.context.message.processed_message_content = buttonTitle;
    payload.context.message.content_attributes.button_reply.id = buttonId;
    payload.context.message.content_attributes.button_reply.title = buttonTitle;
    payload.context.message.content_attributes.interactive_payload.button_reply.id = buttonId;
    payload.context.message.content_attributes.interactive_payload.button_reply.title = buttonTitle;
    payload.context["socialwise-chatwit"].message_data.interactive_data.button_id = buttonId;
    payload.context["socialwise-chatwit"].message_data.interactive_data.button_title = buttonTitle;
    payload.context.button_id = buttonId;
    payload.context.button_title = buttonTitle;
    payload.context.contact_phone = phoneNumber;
    payload.context.contact_source = phoneNumber.replace("+", "");
    payload.session_id = phoneNumber.replace("+", "");
    payload.context["socialwise-chatwit"].contact_data.phone_number = phoneNumber;
    payload.context["socialwise-chatwit"].whatsapp_identifiers.contact_source = phoneNumber.replace("+", "");
    return payload;
  };

  const createCustomInstagramPayload = () => {
    const payload = JSON.parse(JSON.stringify(socialwiseInstagramPayload));
    payload.message = userMessage;
    payload.context.message.content = userMessage;
    payload.context.message.processed_message_content = userMessage;
    payload.context.message_content = userMessage;
    return payload;
  };

  const createCustomInstagramButtonPayload = () => {
    const payload = JSON.parse(JSON.stringify(socialwiseInstagramButtonPayload));
    payload.message = buttonTitle;
    payload.context.message.content = buttonTitle;
    payload.context.message.processed_message_content = buttonTitle;
    payload.context.message.content_attributes.postback_payload = instagramButtonId;
    payload.context["socialwise-chatwit"].message_data.instagram_data.postback_payload = instagramButtonId;
    payload.context.interaction_type = "postback";
    payload.context.postback_payload = instagramButtonId;
    return payload;
  };

  const sendToExternal = async (payload: any) => {
    try {
      setLoading(true);
      setResponse(null);

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

  // Payloads padrão (SocialwiseFlow) - versões completas
  const socialwiseWhatsappPayload = {
    "session_id": "558597550136",
    "message": "Queria saber mais sobre o mandado de segurança da OAB",
    "channel_type": "Channel::Whatsapp",
    "language": "pt_BR",
    "context": {
      "message": {
        "id": 36021,
        "content": "Queria saber mais sobre o mandado de segurança da OAB",
        "account_id": 3,
        "inbox_id": 4,
        "conversation_id": 2133,
        "message_type": "incoming",
        "created_at": "2025-08-13T22:38:24.870Z",
        "updated_at": "2025-08-13T22:38:24.870Z",
        "private": false,
        "status": "sent",
        "source_id": "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FFOTRBNzA5ODRCNzhCNTEzNTEA",
        "content_type": "text",
        "content_attributes": {},
        "sender_type": "Contact",
        "sender_id": 1447,
        "external_source_ids": {},
        "additional_attributes": {},
        "processed_message_content": "Queria saber mais sobre o mandado de segurança da OAB",
        "sentiment": {}
      },
      "conversation": {
        "id": 2133,
        "account_id": 3,
        "inbox_id": 4,
        "status": "pending",
        "assignee_id": null,
        "created_at": "2025-08-12T17:53:23.278Z",
        "updated_at": "2025-08-13T22:38:24.873Z",
        "contact_id": 1447,
        "display_id": 1923,
        "contact_last_seen_at": null,
        "agent_last_seen_at": "2025-08-12T18:57:06.792Z",
        "additional_attributes": {},
        "contact_inbox_id": 1690,
        "uuid": "08c5e7d4-9100-41bb-bf5b-c55a965cebcb",
        "identifier": null,
        "last_activity_at": "2025-08-13T22:38:24.870Z",
        "team_id": null,
        "campaign_id": null,
        "snoozed_until": null,
        "custom_attributes": {},
        "assignee_last_seen_at": null,
        "first_reply_created_at": null,
        "priority": null,
        "sla_policy_id": null,
        "waiting_since": "2025-08-12T17:53:23.278Z",
        "cached_label_list": null,
        "label_list": []
      },
      "contact": {
        "id": 1447,
        "name": "Witalo Rocha",
        "email": null,
        "phone_number": "+558597550136",
        "account_id": 3,
        "created_at": "2025-07-06T14:35:28.590Z",
        "updated_at": "2025-08-13T22:38:24.940Z",
        "additional_attributes": {},
        "identifier": null,
        "custom_attributes": {},
        "last_activity_at": "2025-08-13T22:38:24.932Z",
        "contact_type": "lead",
        "middle_name": "",
        "last_name": "",
        "location": null,
        "country_code": null,
        "blocked": false,
        "label_list": []
      },
      "inbox": {
        "id": 4,
        "channel_id": 1,
        "account_id": 3,
        "name": "WhatsApp - ANA",
        "created_at": "2024-06-09T00:52:47.311Z",
        "updated_at": "2025-08-13T21:50:09.580Z",
        "channel_type": "Channel::Whatsapp",
        "enable_auto_assignment": true,
        "greeting_enabled": false,
        "greeting_message": null,
        "email_address": null,
        "working_hours_enabled": false,
        "out_of_office_message": null,
        "timezone": "UTC",
        "enable_email_collect": true,
        "csat_survey_enabled": false,
        "allow_messages_after_resolved": true,
        "auto_assignment_config": {},
        "lock_to_single_conversation": false,
        "portal_id": null,
        "sender_name_type": "friendly",
        "business_name": null,
        "allow_agent_to_delete_message": true,
        "external_token": null,
        "csat_response_visible": false,
        "csat_config": {}
      },
      "socialwise-chatwit": {
        "whatsapp_identifiers": {
          "wamid": "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FFOTRBNzA5ODRCNzhCNTEzNTEA",
          "whatsapp_id": "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FFOTRBNzA5ODRCNzhCNTEzNTEA",
          "contact_source": "558597550136"
        },
        "contact_data": {
          "id": 1447,
          "name": "Witalo Rocha",
          "phone_number": "+558597550136",
          "email": null,
          "identifier": null,
          "custom_attributes": {}
        },
        "conversation_data": {
          "id": 2133,
          "status": "pending",
          "assignee_id": null,
          "created_at": "2025-08-12T17:53:23Z",
          "updated_at": "2025-08-13T22:38:24Z"
        },
        "message_data": {
          "id": 36021,
          "content": "Queria saber mais sobre o mandado de segurança da OAB",
          "content_type": "text",
          "message_type": "incoming",
          "created_at": "2025-08-13T22:38:24Z",
          "interactive_data": {},
          "instagram_data": {}
        },
        "inbox_data": {
          "id": 4,
          "name": "WhatsApp - ANA",
          "channel_type": "Channel::Whatsapp"
        },
        "account_data": {
          "id": 3,
          "name": "DraAmandaSousa"
        },
        "metadata": {
          "socialwise_active": true,
          "is_whatsapp_channel": true,
          "payload_version": "2.0",
          "timestamp": "2025-08-13T22:38:25Z",
          "has_whatsapp_api_key": true
        },
        "whatsapp_api_key": "EAAGIBII4GXQBO2qgvJ2jdcUmgkdqBo5bUKEanJWmCLpcZAsq0Ovpm4JNlrNLeZAv3OYNrdCqqQBAHfEfPFD0FPnZAOQJURB9GKcbXpa83XdAsa3i6fTr23lBFM2LwUZC23xXrZAnB8QjCCFZBxrxlBvzPj8LsejvUjz0C04Q8Jsl8nTGHUd4ZBRPc4NiHFnc",
        "whatsapp_phone_number_id": "274633962398273",
        "whatsapp_business_id": "294585820394901"
      },
      "wamid": "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FFOTRBNzA5ODRCNzhCNTEzNTEA",
      "contact_source": "558597550136",
      "contact_name": "Witalo Rocha",
      "contact_phone": "+558597550136",
      "contact_email": null,
      "contact_identifier": null,
      "contact_id": 1447,
      "conversation_id": 2133,
      "conversation_status": "pending",
      "conversation_assignee_id": null,
      "conversation_created_at": "2025-08-12T17:53:23Z",
      "conversation_updated_at": "2025-08-13T22:38:24Z",
      "message_id": 36021,
      "message_content": "Queria saber mais sobre o mandado de segurança da OAB",
      "message_type": "incoming",
      "message_created_at": "2025-08-13T22:38:24Z",
      "message_content_type": "text",
      "button_id": null,
      "button_title": null,
      "list_id": null,
      "list_title": null,
      "list_description": null,
      "interaction_type": null,
      "postback_payload": null,
      "quick_reply_payload": null,
      "inbox_id": 4,
      "inbox_name": "WhatsApp - ANA",
      "channel_type": "Channel::Whatsapp",
      "account_id": 3,
      "account_name": "DraAmandaSousa",
      "whatsapp_api_key": "EAAGIBII4GXQBO2qgvJ2jdcUmgkdqBo5bUKEanJWmCLpcZAsq0Ovpm4JNlrNLeZAv3OYNrdCqqQBAHfEfPFD0FPnZAOQJURB9GKcbXpa83XdAsa3i6fTr23lBFM2LwUZC23xXrZAnB8QjCCFZBxrxlBvzPj8LsejvUjz0C04Q8Jsl8nTGHUd4ZBRPc4NiHFnc",
      "phone_number_id": "274633962398273",
      "business_id": "294585820394901",
      "socialwise_active": true,
      "is_whatsapp_channel": true,
      "has_whatsapp_api_key": true,
      "payload_version": "2.0",
      "timestamp": "2025-08-13T22:38:25Z"
    }
  };

  const socialwiseWhatsappButtonPayload = {
    "session_id": "558597550136",
    "message": "Falar com a Dra",
    "channel_type": "Channel::Whatsapp",
    "language": "pt_BR",
    "context": {
      "message": {
        "id": 36023,
        "content": "Falar com a Dra",
        "account_id": 3,
        "inbox_id": 4,
        "conversation_id": 2133,
        "message_type": "incoming",
        "created_at": "2025-08-13T22:44:06.875Z",
        "updated_at": "2025-08-13T22:44:06.875Z",
        "private": false,
        "status": "sent",
        "source_id": "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FCNDNFNUMzMTJGQjc5RjcyOEQA",
        "content_type": "text",
        "content_attributes": {
          "button_reply": {
            "id": "btn_1754993780819_0_tqji",
            "title": "Falar com a Dra"
          },
          "interaction_type": "button_reply",
          "interactive_payload": {
            "type": "button_reply",
            "button_reply": {
              "id": "btn_1754993780819_0_tqji",
              "title": "Falar com a Dra"
            }
          }
        },
        "sender_type": "Contact",
        "sender_id": 1447,
        "external_source_ids": {},
        "additional_attributes": {},
        "processed_message_content": "Falar com a Dra",
        "sentiment": {}
      },
      "conversation": {
        "id": 2133,
        "account_id": 3,
        "inbox_id": 4,
        "status": "pending",
        "assignee_id": null,
        "created_at": "2025-08-12T17:53:23.278Z",
        "updated_at": "2025-08-13T22:44:06.877Z",
        "contact_id": 1447,
        "display_id": 1923,
        "contact_last_seen_at": null,
        "agent_last_seen_at": "2025-08-12T18:57:06.792Z",
        "additional_attributes": {},
        "contact_inbox_id": 1690,
        "uuid": "08c5e7d4-9100-41bb-bf5b-c55a965cebcb",
        "identifier": null,
        "last_activity_at": "2025-08-13T22:44:06.875Z",
        "team_id": null,
        "campaign_id": null,
        "snoozed_until": null,
        "custom_attributes": {},
        "assignee_last_seen_at": null,
        "first_reply_created_at": null,
        "priority": null,
        "sla_policy_id": null,
        "waiting_since": "2025-08-12T17:53:23.278Z",
        "cached_label_list": null,
        "label_list": []
      },
      "contact": {
        "id": 1447,
        "name": "Witalo Rocha",
        "email": null,
        "phone_number": "+558597550136",
        "account_id": 3,
        "created_at": "2025-07-06T14:35:28.590Z",
        "updated_at": "2025-08-13T22:44:06.926Z",
        "additional_attributes": {},
        "identifier": null,
        "custom_attributes": {},
        "last_activity_at": "2025-08-13T22:44:06.920Z",
        "contact_type": "lead",
        "middle_name": "",
        "last_name": "",
        "location": null,
        "country_code": null,
        "blocked": false,
        "label_list": []
      },
      "inbox": {
        "id": 4,
        "channel_id": 1,
        "account_id": 3,
        "name": "WhatsApp - ANA",
        "created_at": "2024-06-09T00:52:47.311Z",
        "updated_at": "2025-08-13T21:50:09.580Z",
        "channel_type": "Channel::Whatsapp",
        "enable_auto_assignment": true,
        "greeting_enabled": false,
        "greeting_message": null,
        "email_address": null,
        "working_hours_enabled": false,
        "out_of_office_message": null,
        "timezone": "UTC",
        "enable_email_collect": true,
        "csat_survey_enabled": false,
        "allow_messages_after_resolved": true,
        "auto_assignment_config": {},
        "lock_to_single_conversation": false,
        "portal_id": null,
        "sender_name_type": "friendly",
        "business_name": null,
        "allow_agent_to_delete_message": true,
        "external_token": null,
        "csat_response_visible": false,
        "csat_config": {}
      },
      "socialwise-chatwit": {
        "whatsapp_identifiers": {
          "wamid": "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FCNDNFNUMzMTJGQjc5RjcyOEQA",
          "whatsapp_id": "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FCNDNFNUMzMTJGQjc5RjcyOEQA",
          "contact_source": "558597550136"
        },
        "contact_data": {
          "id": 1447,
          "name": "Witalo Rocha",
          "phone_number": "+558597550136",
          "email": null,
          "identifier": null,
          "custom_attributes": {}
        },
        "conversation_data": {
          "id": 2133,
          "status": "pending",
          "assignee_id": null,
          "created_at": "2025-08-12T17:53:23Z",
          "updated_at": "2025-08-13T22:44:06Z"
        },
        "message_data": {
          "id": 36023,
          "content": "Falar com a Dra",
          "content_type": "text",
          "message_type": "incoming",
          "created_at": "2025-08-13T22:44:06Z",
          "interactive_data": {
            "button_id": "btn_1754993780819_0_tqji",
            "button_title": "Falar com a Dra",
            "interaction_type": "button_reply"
          },
          "instagram_data": {}
        },
        "inbox_data": {
          "id": 4,
          "name": "WhatsApp - ANA",
          "channel_type": "Channel::Whatsapp"
        },
        "account_data": {
          "id": 3,
          "name": "DraAmandaSousa"
        },
        "metadata": {
          "socialwise_active": true,
          "is_whatsapp_channel": true,
          "payload_version": "2.0",
          "timestamp": "2025-08-13T22:44:07Z",
          "has_whatsapp_api_key": true
        },
        "whatsapp_api_key": "EAAGIBII4GXQBO2qgvJ2jdcUmgkdqBo5bUKEanJWmCLpcZAsq0Ovpm4JNlrNLeZAv3OYNrdCqqQBAHfEfPFD0FPnZAOQJURB9GKcbjXeDpa83XdAsa3i6fTr23lBFM2LwUZC23xXrZAnB8QjCCFZBxrxlBvzPj8LsejvUjz0C04Q8Jsl8nTGHUd4ZBRPc4NiHFnc",
        "whatsapp_phone_number_id": "274633962398273",
        "whatsapp_business_id": "294585820394901"
      },
      "wamid": "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FCNDNFNUMzMTJGQjc5RjcyOEQA",
      "contact_source": "558597550136",
      "contact_name": "Witalo Rocha",
      "contact_phone": "+558597550136",
      "contact_email": null,
      "contact_identifier": null,
      "contact_id": 1447,
      "conversation_id": 2133,
      "conversation_status": "pending",
      "conversation_assignee_id": null,
      "conversation_created_at": "2025-08-12T17:53:23Z",
      "conversation_updated_at": "2025-08-13T22:44:06Z",
      "message_id": 36023,
      "message_content": "Falar com a Dra",
      "message_type": "incoming",
      "message_created_at": "2025-08-13T22:44:06Z",
      "message_content_type": "text",
      "button_id": "btn_1754993780819_0_tqji",
      "button_title": "Falar com a Dra",
      "list_id": null,
      "list_title": null,
      "list_description": null,
      "interaction_type": null,
      "postback_payload": null,
      "quick_reply_payload": null,
      "inbox_id": 4,
      "inbox_name": "WhatsApp - ANA",
      "channel_type": "Channel::Whatsapp",
      "account_id": 3,
      "account_name": "DraAmandaSousa",
      "whatsapp_api_key": "EAAGIBII4GXQBO2qgvJ2jdcUmgkdqBo5bUKEanJWmCLpcZAsq0Ovpm4JNlrNLeZAv3OYNrdCqqQBAHfEfPFD0FPnZAOQJURB9GKcbjXeDpa83XdAsa3i6fTr23lBFM2LwUZC23xXrZAnB8QjCCFZBxrxlBvzPj8LsejvUjz0C04Q8Jsl8nTGHUd4ZBRPc4NiHFnc",
      "phone_number_id": "274633962398273",
      "business_id": "294585820394901",
      "socialwise_active": true,
      "is_whatsapp_channel": true,
      "has_whatsapp_api_key": true,
      "payload_version": "2.0",
      "timestamp": "2025-08-13T22:44:07Z"
    }
  };

  const socialwiseInstagramPayload = {
    "session_id": "1002859634954741",
    "message": "Bom dia mais informações sobre recurso da OAB",
    "channel_type": "Channel::Instagram",
    "language": "pt-BR",
    "context": {
      "message": {
        "id": 36027,
        "content": "Bom dia mais informações sobre recurso da OAB",
        "account_id": 3,
        "inbox_id": 105,
        "conversation_id": 2132,
        "message_type": "incoming",
        "created_at": "2025-08-13T23:00:33.751Z",
        "updated_at": "2025-08-13T23:00:33.751Z",
        "private": false,
        "status": "sent",
        "source_id": "aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDQ3NDk3Mzc2NjYxOjM0MDI4MjM2Njg0MTcxMDMwMTI0NDI1ODczNzUyMDkyNTU5MjcwNzozMjM3NjM2MDY3NjE3NzM3MDExMzg1NjczMDA5OTA4OTQwOAZDZD",
        "content_type": "text",
        "content_attributes": {
          "in_reply_to_external_id": null
        },
        "sender_type": "Contact",
        "sender_id": 1885,
        "external_source_ids": {},
        "additional_attributes": {},
        "processed_message_content": "Bom dia mais informações sobre recurso da OAB",
        "sentiment": {}
      },
      "conversation": {
        "id": 2132,
        "account_id": 3,
        "inbox_id": 105,
        "status": "pending",
        "assignee_id": null,
        "created_at": "2025-08-12T17:30:10.706Z",
        "updated_at": "2025-08-13T23:00:33.753Z",
        "contact_id": 1885,
        "display_id": 1922,
        "contact_last_seen_at": null,
        "agent_last_seen_at": "2025-08-12T21:29:14.507Z",
        "additional_attributes": {},
        "contact_inbox_id": 2177,
        "uuid": "0d586852-6639-4bd1-b2c9-c6df07756e6f",
        "identifier": null,
        "last_activity_at": "2025-08-13T23:00:33.751Z",
        "team_id": null,
        "campaign_id": null,
        "snoozed_until": null,
        "custom_attributes": {},
        "assignee_last_seen_at": null,
        "first_reply_created_at": null,
        "priority": null,
        "sla_policy_id": null,
        "waiting_since": "2025-08-12T17:30:10.706Z",
        "cached_label_list": null,
        "label_list": []
      },
      "contact": {
        "id": 1885,
        "name": "Witalo Rocha",
        "email": null,
        "phone_number": null,
        "account_id": 3,
        "created_at": "2025-07-25T11:02:03.286Z",
        "updated_at": "2025-08-13T23:00:33.799Z",
        "additional_attributes": {
          "social_profiles": {
            "instagram": "witalo_rocha_"
          },
          "social_instagram_user_name": "witalo_rocha_",
          "social_instagram_follower_count": 1262,
          "social_instagram_is_verified_user": false,
          "social_instagram_is_business_follow_user": true,
          "social_instagram_is_user_follow_business": true
        },
        "identifier": null,
        "custom_attributes": {},
        "last_activity_at": "2025-08-13T23:00:33.792Z",
        "contact_type": "lead",
        "middle_name": "",
        "last_name": "",
        "location": null,
        "country_code": null,
        "blocked": false,
        "label_list": []
      },
      "inbox": {
        "id": 105,
        "channel_id": 4,
        "account_id": 3,
        "name": "dra.amandasousadv",
        "created_at": "2025-07-25T10:44:53.201Z",
        "updated_at": "2025-07-25T10:44:53.201Z",
        "channel_type": "Channel::Instagram",
        "enable_auto_assignment": true,
        "greeting_enabled": false,
        "greeting_message": null,
        "email_address": null,
        "working_hours_enabled": false,
        "out_of_office_message": null,
        "timezone": "UTC",
        "enable_email_collect": true,
        "csat_survey_enabled": false,
        "allow_messages_after_resolved": true,
        "auto_assignment_config": {},
        "lock_to_single_conversation": false,
        "portal_id": null,
        "sender_name_type": "friendly",
        "business_name": null,
        "allow_agent_to_delete_message": true,
        "external_token": null,
        "csat_response_visible": false,
        "csat_config": {}
      },
      "socialwise-chatwit": {
        "whatsapp_identifiers": {
          "wamid": "aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDQ3NDk3Mzc2NjYxOjM0MDI4MjM2Njg0MTcxMDMwMTI0NDI1ODczNzUyMDkyNTU5MjcwNzozMjM3NjM2MDY3NjE3NzM3MDExMzg1NjczMDA5OTA4OTQwOAZDZD",
          "whatsapp_id": "aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDQ3NDk3Mzc2NjYxOjM0MDI4MjM2Njg0MTcxMDMwMTI0NDI1ODczNzUyMDkyNTU5MjcwNzozMjM3NjM2MDY3NjE3NzM3MDExMzg1NjczMDA5OTA4OTQwOAZDZD",
          "contact_source": "1002859634954741"
        },
        "contact_data": {
          "id": 1885,
          "name": "Witalo Rocha",
          "phone_number": null,
          "email": null,
          "identifier": null,
          "custom_attributes": {}
        },
        "conversation_data": {
          "id": 2132,
          "status": "pending",
          "assignee_id": null,
          "created_at": "2025-08-12T17:30:10Z",
          "updated_at": "2025-08-13T23:00:33Z"
        },
        "message_data": {
          "id": 36027,
          "content": "Bom dia mais informações sobre recurso da OAB",
          "content_type": "text",
          "message_type": "incoming",
          "created_at": "2025-08-13T23:00:33Z",
          "interactive_data": {},
          "instagram_data": {}
        },
        "inbox_data": {
          "id": 105,
          "name": "dra.amandasousadv",
          "channel_type": "Channel::Instagram"
        },
        "account_data": {
          "id": 3,
          "name": "DraAmandaSousa"
        },
        "metadata": {
          "socialwise_active": true,
          "is_whatsapp_channel": false,
          "payload_version": "2.0",
          "timestamp": "2025-08-13T23:00:33Z",
          "has_whatsapp_api_key": false
        },
        "whatsapp_api_key": null,
        "whatsapp_phone_number_id": null,
        "whatsapp_business_id": null
      },
      "wamid": "aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDQ3NDk3Mzc2NjYxOjM0MDI4MjM2Njg0MTcxMDMwMTI0NDI1ODczNzUyMDkyNTU5MjcwNzozMjM3NjM2MDY3NjE3NzM3MDExMzg1NjczMDA5OTA4OTQwOAZDZD",
      "contact_source": "1002859634954741",
      "contact_name": "Witalo Rocha",
      "contact_phone": null,
      "contact_email": null,
      "contact_identifier": null,
      "contact_id": 1885,
      "conversation_id": 2132,
      "conversation_status": "pending",
      "conversation_assignee_id": null,
      "conversation_created_at": "2025-08-12T17:30:10Z",
      "conversation_updated_at": "2025-08-13T23:00:33Z",
      "message_id": 36027,
      "message_content": "Bom dia mais informações sobre recurso da OAB",
      "message_type": "incoming",
      "message_created_at": "2025-08-13T23:00:33Z",
      "message_content_type": "text",
      "button_id": null,
      "button_title": null,
      "list_id": null,
      "list_title": null,
      "list_description": null,
      "interaction_type": null,
      "postback_payload": null,
      "quick_reply_payload": null,
      "inbox_id": 105,
      "inbox_name": "dra.amandasousadv",
      "channel_type": "Channel::Instagram",
      "account_id": 3,
      "account_name": "DraAmandaSousa",
      "whatsapp_api_key": null,
      "phone_number_id": null,
      "business_id": null,
      "socialwise_active": true,
      "is_whatsapp_channel": false,
      "has_whatsapp_api_key": false,
      "payload_version": "2.0",
      "timestamp": "2025-08-13T23:00:33Z"
    }
  };

  const socialwiseInstagramButtonPayload = {
    "session_id": "1002859634954741",
    "message": "Falar com a Dra",
    "channel_type": "Channel::Instagram",
    "language": "pt-BR",
    "context": {
      "message": {
        "id": 36029,
        "content": "Falar com a Dra",
        "account_id": 3,
        "inbox_id": 105,
        "conversation_id": 2132,
        "message_type": "incoming",
        "created_at": "2025-08-13T23:02:06.966Z",
        "updated_at": "2025-08-13T23:02:06.966Z",
        "private": false,
        "status": "sent",
        "source_id": "aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDQ3NDk3Mzc2NjYxOjM0MDI4MjM2Njg0MTcxMDMwMTI0NDI1ODczNzUyMDkyNTU5MjcwNzozMjM3NjM2MjQzNzg0OTM0MjgwNjMyNjUzMDgyNDczMjY3MgZDZD",
        "content_type": "text",
        "content_attributes": {
          "in_reply_to_external_id": null,
          "postback_payload": "ig_btn_1755004696546_uekaa4clu"
        },
        "sender_type": "Contact",
        "sender_id": 1885,
        "external_source_ids": {},
        "additional_attributes": {},
        "processed_message_content": "Falar com a Dra",
        "sentiment": {}
      },
      "conversation": {
        "id": 2132,
        "account_id": 3,
        "inbox_id": 105,
        "status": "pending",
        "assignee_id": null,
        "created_at": "2025-08-12T17:30:10.706Z",
        "updated_at": "2025-08-13T23:02:06.968Z",
        "contact_id": 1885,
        "display_id": 1922,
        "contact_last_seen_at": null,
        "agent_last_seen_at": "2025-08-12T21:29:14.507Z",
        "additional_attributes": {},
        "contact_inbox_id": 2177,
        "uuid": "0d586852-6639-4bd1-b2c9-c6df07756e6f",
        "identifier": null,
        "last_activity_at": "2025-08-13T23:02:06.966Z",
        "team_id": null,
        "campaign_id": null,
        "snoozed_until": null,
        "custom_attributes": {},
        "assignee_last_seen_at": null,
        "first_reply_created_at": null,
        "priority": null,
        "sla_policy_id": null,
        "waiting_since": "2025-08-12T17:30:10.706Z",
        "cached_label_list": null,
        "label_list": []
      },
      "contact": {
        "id": 1885,
        "name": "Witalo Rocha",
        "email": null,
        "phone_number": null,
        "account_id": 3,
        "created_at": "2025-07-25T11:02:03.286Z",
        "updated_at": "2025-08-13T23:02:07.005Z",
        "additional_attributes": {
          "social_profiles": {
            "instagram": "witalo_rocha_"
          },
          "social_instagram_user_name": "witalo_rocha_",
          "social_instagram_follower_count": 1262,
          "social_instagram_is_verified_user": false,
          "social_instagram_is_business_follow_user": true,
          "social_instagram_is_user_follow_business": true
        },
        "identifier": null,
        "custom_attributes": {},
        "last_activity_at": "2025-08-13T23:02:07.002Z",
        "contact_type": "lead",
        "middle_name": "",
        "last_name": "",
        "location": null,
        "country_code": null,
        "blocked": false,
        "label_list": []
      },
      "inbox": {
        "id": 105,
        "channel_id": 4,
        "account_id": 3,
        "name": "dra.amandasousadv",
        "created_at": "2025-07-25T10:44:53.201Z",
        "updated_at": "2025-07-25T10:44:53.201Z",
        "channel_type": "Channel::Instagram",
        "enable_auto_assignment": true,
        "greeting_enabled": false,
        "greeting_message": null,
        "email_address": null,
        "working_hours_enabled": false,
        "out_of_office_message": null,
        "timezone": "UTC",
        "enable_email_collect": true,
        "csat_survey_enabled": false,
        "allow_messages_after_resolved": true,
        "auto_assignment_config": {},
        "lock_to_single_conversation": false,
        "portal_id": null,
        "sender_name_type": "friendly",
        "business_name": null,
        "allow_agent_to_delete_message": true,
        "external_token": null,
        "csat_response_visible": false,
        "csat_config": {}
      },
      "socialwise-chatwit": {
        "whatsapp_identifiers": {
          "wamid": "aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDQ3NDk3Mzc2NjYxOjM0MDI4MjM2Njg0MTcxMDMwMTI0NDI1ODczNzUyMDkyNTU5MjcwNzozMjM3NjM2MjQzNzg0OTM0MjgwNjMyNjUzMDgyNDczMjY3MgZDZD",
          "whatsapp_id": "aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDQ3NDk3Mzc2NjYxOjM0MDI4MjM2Njg0MTcxMDMwMTI0NDI1ODczNzUyMDkyNTU5MjcwNzozMjM3NjM2MjQzNzg0OTM0MjgwNjMyNjUzMDgyNDczMjY3MgZDZD",
          "contact_source": "1002859634954741"
        },
        "contact_data": {
          "id": 1885,
          "name": "Witalo Rocha",
          "phone_number": null,
          "email": null,
          "identifier": null,
          "custom_attributes": {}
        },
        "conversation_data": {
          "id": 2132,
          "status": "pending",
          "assignee_id": null,
          "created_at": "2025-08-12T17:30:10Z",
          "updated_at": "2025-08-13T23:02:06Z"
        },
        "message_data": {
          "id": 36029,
          "content": "Falar com a Dra",
          "content_type": "text",
          "message_type": "incoming",
          "created_at": "2025-08-13T23:02:06Z",
          "interactive_data": {},
          "instagram_data": {
            "postback_payload": "ig_btn_1755004696546_uekaa4clu",
            "interaction_type": "postback"
          }
        },
        "inbox_data": {
          "id": 105,
          "name": "dra.amandasousadv",
          "channel_type": "Channel::Instagram"
        },
        "account_data": {
          "id": 3,
          "name": "DraAmandaSousa"
        },
        "metadata": {
          "socialwise_active": true,
          "is_whatsapp_channel": false,
          "payload_version": "2.0",
          "timestamp": "2025-08-13T23:02:07Z",
          "has_whatsapp_api_key": false
        },
        "whatsapp_api_key": null,
        "whatsapp_phone_number_id": null,
        "whatsapp_business_id": null
      },
      "wamid": "aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDQ3NDk3Mzc2NjYxOjM0MDI4MjM2Njg0MTcxMDMwMTI0NDI1ODczNzUyMDkyNTU5MjcwNzozMjM3NjM2MjQzNzg0OTM0MjgwNjMyNjUzMDgyNDczMjY3MgZDZD",
      "contact_source": "1002859634954741",
      "contact_name": "Witalo Rocha",
      "contact_phone": null,
      "contact_email": null,
      "contact_identifier": null,
      "contact_id": 1885,
      "conversation_id": 2132,
      "conversation_status": "pending",
      "conversation_assignee_id": null,
      "conversation_created_at": "2025-08-12T17:30:10Z",
      "conversation_updated_at": "2025-08-13T23:02:06Z",
      "message_id": 36029,
      "message_content": "Falar com a Dra",
      "message_type": "incoming",
      "message_created_at": "2025-08-13T23:02:06Z",
      "message_content_type": "text",
      "button_id": null,
      "button_title": null,
      "list_id": null,
      "list_title": null,
      "list_description": null,
      "interaction_type": "postback",
      "postback_payload": "ig_btn_1755004696546_uekaa4clu",
      "quick_reply_payload": null,
      "inbox_id": 105,
      "inbox_name": "dra.amandasousadv",
      "channel_type": "Channel::Instagram",
      "account_id": 3,
      "account_name": "DraAmandaSousa",
      "whatsapp_api_key": null,
      "phone_number_id": null,
      "business_id": null,
      "socialwise_active": true,
      "is_whatsapp_channel": false,
      "has_whatsapp_api_key": false,
      "payload_version": "2.0",
      "timestamp": "2025-08-13T23:02:07Z"
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <TestTube className="h-8 w-8 text-blue-500" />
        <div>
          <h1 className="text-3xl font-bold">Teste de Webhook</h1>
          <p className="text-muted-foreground">
            Teste webhooks do Dialogflow e SocialWise Flow
          </p>
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
                  size="sm"
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

            {/* Personalização de mensagens e botões */}
            <div className="space-y-4 border-t pt-4">
              <h4 className="text-sm font-medium">Personalização de Conteúdo</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="userMessage" className="text-sm font-medium">
                    Mensagem do usuário
                  </label>
                  <Input
                    id="userMessage"
                    value={userMessage}
                    onChange={(e) => setUserMessage(e.target.value)}
                    placeholder="Digite a mensagem do usuário"
                    className="max-w-md"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Usado nos payloads de texto simples
                  </p>
                </div>

                <div>
                  <label htmlFor="buttonTitle" className="text-sm font-medium">
                    Título do botão
                  </label>
                  <Input
                    id="buttonTitle"
                    value={buttonTitle}
                    onChange={(e) => setButtonTitle(e.target.value)}
                    placeholder="Digite o título do botão"
                    className="max-w-md"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Usado nos payloads com botões
                  </p>
                </div>

                <div>
                  <label htmlFor="buttonId" className="text-sm font-medium">
                    ID do botão WhatsApp
                  </label>
                  <Input
                    id="buttonId"
                    value={buttonId}
                    onChange={(e) => setButtonId(e.target.value)}
                    placeholder="btn_1754993780819_0_tqji"
                    className="max-w-md"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    ID único do botão WhatsApp
                  </p>
                </div>

                <div>
                  <label htmlFor="instagramButtonId" className="text-sm font-medium">
                    ID do botão Instagram
                  </label>
                  <Input
                    id="instagramButtonId"
                    value={instagramButtonId}
                    onChange={(e) => setInstagramButtonId(e.target.value)}
                    placeholder="ig_btn_1755004696546_uekaa4clu"
                    className="max-w-md"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    ID único do botão Instagram
                  </p>
                </div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h5 className="text-sm font-medium">WhatsApp</h5>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => sendToExternal(createCustomWhatsappPayload())}
                  disabled={loading}
                  variant="outline"
                  size="sm"
                >
                  Texto Simples
                </Button>
                <Button
                  onClick={() => sendToExternal(createCustomWhatsappButtonPayload())}
                  disabled={loading}
                  variant="outline"
                  size="sm"
                >
                  Com Botão
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <h5 className="text-sm font-medium">Instagram</h5>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => sendToExternal(createCustomInstagramPayload())}
                  disabled={loading}
                  variant="outline"
                  size="sm"
                >
                  Texto Simples
                </Button>
                <Button
                  onClick={() => sendToExternal(createCustomInstagramButtonPayload())}
                  disabled={loading}
                  variant="outline"
                  size="sm"
                >
                  Com Botão
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
              <Button onClick={savePayload} variant="outline" size="sm">
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
                      size="sm"
                    >
                      Carregar
                    </Button>
                    <Button
                      onClick={() => deletePayload(payload.id)}
                      variant="outline"
                      size="sm"
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
            Estrutura do payload usado nos testes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">
            {JSON.stringify(realPayload, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
