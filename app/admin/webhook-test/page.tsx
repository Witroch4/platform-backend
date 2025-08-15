"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, TestTube, Zap, Copy, CheckCircle, XCircle, Save, FolderOpen, Trash2, Link2 } from "lucide-react";
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

  const DEFAULT_EXTERNAL_DEST = "https://moved-chigger-randomly.ngrok-free.app/api/integrations/webhooks/socialwiseflow";

  useEffect(() => {
    // Carregar status da Flash Intent
    const loadFlashIntentStatus = async () => {
      try {
        const response = await fetch("/api/admin/resposta-rapida/global-status");
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
      const saved = localStorage.getItem('webhook-saved-payloads');
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
        createdAt: new Date().toISOString()
      };

      const updatedPayloads = [...savedPayloads, newPayload];
      setSavedPayloads(updatedPayloads);
      localStorage.setItem('webhook-saved-payloads', JSON.stringify(updatedPayloads));
      
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
    const updatedPayloads = savedPayloads.filter(p => p.id !== id);
    setSavedPayloads(updatedPayloads);
    localStorage.setItem('webhook-saved-payloads', JSON.stringify(updatedPayloads));
    toast.success("Payload removido");
  };

  // Payload real do Dialogflow fornecido pelo usuário
  const realPayload = {
    "responseId": "db6513de-92fd-49d8-a59b-9224263932c6-6583c630",
    "queryResult": {
      "queryText": "Finalizar",
      "parameters": {
        "person": ""
      },
      "allRequiredParamsPresent": true,
      "fulfillmentText": "Estarei disponível para ajudar quando precisar. 🌟 Tenha um dia maravilhoso e saiba que pode contar comigo sempre que necessário. 👋🏼",
      "fulfillmentMessages": [
        {
          "text": {
            "text": ["Estarei disponível para ajudar quando precisar. 🌟 Tenha um dia maravilhoso e saiba que pode contar comigo sempre que necessário. 👋🏼"]
          }
        }
      ],
      "outputContexts": [
        {
          "name": "projects/msjudicialoab-rxtd/agent/sessions/558597550136/contexts/oab-followup",
          "lifespanCount": 1,
          "parameters": {
            "location": "⚠️ AVISO IMPORTANTE: VAGAS ESGOTADAS PARA RECURSO!\n\nOlá, queridos alunos e alunas!\n\nInformamos que as vagas para elaboração de recurso já foram preenchidas neste momento. Prezando sempre pela qualidade e excelência que são nossa marca registrada, optamos por limitar o número de atendimentos para garantir o melhor suporte possível.\n\n🙏🏼 Agradecemos imensamente a compreensão e confiança depositada no nosso trabalho.\n\nAssim que novas vagas forem abertas, avisaremos imediatamente.\n\nSigam firmes, rumo à aprovação! 🔥🦅\n\n#MétodoFênix #AprovadosEmChamas",
            "person": "",
            "person.original": "",
            "location.original": "",
            "time-period": "",
            "time-period.original": ""
          }
        },
        {
          "name": "projects/msjudicialoab-rxtd/agent/sessions/558597550136/contexts/finalizar",
          "lifespanCount": 1,
          "parameters": {
            "location": "⚠️ AVISO IMPORTANTE: VAGAS ESGOTADAS PARA RECURSO!\n\nOlá, queridos alunos e alunas!\n\nInformamos que as vagas para elaboração de recurso já foram preenchidas neste momento. Prezando sempre pela qualidade e excelência que são nossa marca registrada, optamos por limitar o número de atendimentos para garantir o melhor suporte possível.\n\n🙏🏼 Agradecemos imensamente a compreensão e confiança depositada no nosso trabalho.\n\nAssim que novas vagas forem abertas, avisaremos imediatamente.\n\nSigam firmes, rumo à aprovação! 🔥🦅\n\n#MétodoFênix #AprovadosEmChamas",
            "person": "",
            "person.original": "",
            "location.original": "",
            "time-period": "",
            "time-period.original": ""
          }
        },
        {
          "name": "projects/msjudicialoab-rxtd/agent/sessions/558597550136/contexts/oab-followup-2",
          "lifespanCount": 1,
          "parameters": {
            "location": "⚠️ AVISO IMPORTANTE: VAGAS ESGOTADAS PARA RECURSO!\n\nOlá, queridos alunos e alunas!\n\nInformamos que as vagas para elaboração de recurso já foram preenchidas neste momento. Prezando sempre pela qualidade e excelência que são nossa marca registrada, optamos por limitar o número de atendimentos para garantir o melhor suporte possível.\n\n🙏🏼 Agradecemos imensamente a compreensão e confiança depositada no nosso trabalho.\n\nAssim que novas vagas forem abertas, avisaremos imediatamente.\n\nSigam firmes, rumo à aprovação! 🔥🦅\n\n#MétodoFênix #AprovadosEmChamas",
            "person": "",
            "person.original": "",
            "location.original": "",
            "time-period": "",
            "time-period.original": ""
          }
        },
        {
          "name": "projects/msjudicialoab-rxtd/agent/sessions/558597550136/contexts/atendimentohumano",
          "lifespanCount": 4,
          "parameters": {
            "location": "⚠️ AVISO IMPORTANTE: VAGAS ESGOTADAS PARA RECURSO!\n\nOlá, queridos alunos e alunas!\n\nInformamos que as vagas para elaboração de recurso já foram preenchidas neste momento. Prezando sempre pela qualidade e excelência que são nossa marca registrada, optamos por limitar o número de atendimentos para garantir o melhor suporte possível.\n\n🙏🏼 Agradecemos imensamente a compreensão e confiança depositada no nosso trabalho.\n\nAssim que novas vagas forem abertas, avisaremos imediatamente.\n\nSigam firmes, rumo à aprovação! 🔥🦅\n\n#MétodoFênix #AprovadosEmChamas",
            "person": "",
            "person.original": "",
            "location.original": "",
            "time-period": "",
            "time-period.original": ""
          }
        },
        {
          "name": "projects/msjudicialoab-rxtd/agent/sessions/558597550136/contexts/__system_counters__",
          "parameters": {
            "no-input": 0,
            "no-match": 0,
            "person": "",
            "person.original": ""
          }
        }
      ],
      "intent": {
        "name": "projects/msjudicialoab-rxtd/agent/intents/253e32e2-8922-406c-96f5-c669ed4e92c0",
        "displayName": "Finalizar",
        "endInteraction": true
      },
      "intentDetectionConfidence": 1,
      "languageCode": "pt-br"
    },
    "originalDetectIntentRequest": {
      "payload": {
        "conversation_id": 1988,
        "conversation_created_at": "2025-07-25T00:21:51Z",
        "whatsapp_api_key": "EAAGIBII4GXQBO2qgvJ2jdcUmgkdqBo5bUKEanJWmCLpcZAsq0Ovpm4JNlrNLeZAv3OYNrdCqqQBAHfEfPFD0FPnZAOQJURB9GKcbjXeDpa83XdAsa3i6fTr23lBFM2LwUZC23xXrZAnB8QjCCFZBxrxlBvzPj8LsejvUjz0C04Q8Jsl8nTGHUd4ZBRPc4NiHFnc",
        "contact_identifier": "",
        "list_id": "",
        "has_whatsapp_api_key": true,
        "interaction_type": "button_reply",
        "account_name": "DraAmandaSousa",
        "is_whatsapp_channel": true,
        "message_id": 32930,
        "message_type": "incoming",
        "button_title": "Finalizar",
        "contact_phone": "+558597550136",
        "conversation_updated_at": "2025-07-26T21:53:59Z",
        "business_id": "294585820394901",
        "inbox_id": 4,
        "wamid": "wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0E3QThCOEY0MzUwRUVDNkQ4RTAA",
        "phone_number_id": "274633962398273",
        "contact_email": "",
        "contact_id": 1447,
        "message_content": "Finalizar",
        "message_created_at": "2025-07-26T21:53:59Z",
        "inbox_name": "WhatsApp - ANA",
        "conversation_assignee_id": 3,
        "message_content_type": "text",
        "account_id": 3,
        "payload_version": "2.0",
        "channel_type": "Channel::Whatsapp",
        "list_title": "",
        "conversation_status": "pending",
        "button_id": "btn_1753326794020_tbc27gtbw",
        "contact_name": "Witalo Rocha",
        "timestamp": "2025-07-26T21:54:00Z",
        "socialwise_active": true,
        "list_description": "",
        "contact_source": "558597550136"
      }
    },
    "session": "projects/msjudicialoab-rxtd/agent/sessions/558597550136"
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
            contact_source: phoneNumber.replace("+", "")
          }
        },
        session: `projects/msjudicialoab-rxtd/agent/sessions/${phoneNumber.replace("+", "")}`
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
        toast.error(`Erro no webhook: ${response.status} ${response.statusText}`);
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
          endInteraction: false
        }
      },
      originalDetectIntentRequest: {
        ...realPayload.originalDetectIntentRequest,
        payload: {
          ...realPayload.originalDetectIntentRequest.payload,
          interaction_type: "intent",
          button_title: "",
          button_id: "",
          message_content: "Olá"
        }
      }
    };
    sendWebhookTest(intentPayload);
  };

  // ---------- Integração: Destino Customizado (SocialwiseFlow) ----------
  const getExternalDestination = () => (externalDest.trim() || DEFAULT_EXTERNAL_DEST);

  const sendToExternal = async (payload: any) => {
    try {
      setLoading(true);
      setResponse(null);

      const dest = getExternalDestination();
      try { localStorage.setItem("webhook-external-dest", externalDest); } catch {}

      const res = await fetch(dest, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data: any = null;
      try { data = await res.json(); } catch { data = await res.text(); }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        data,
        timestamp: new Date().toISOString(),
        target: dest,
      });

      if (res.ok) toast.success("Enviado ao destino customizado com sucesso");
      else toast.error(`Erro ao enviar ao destino: ${res.status} ${res.statusText}`);
    } catch (error) {
      console.error("Erro no envio externo:", error);
      toast.error("Erro ao enviar ao destino customizado");
      setResponse({ error: error instanceof Error ? error.message : String(error), timestamp: new Date().toISOString() });
    } finally {
      setLoading(false);
    }
  };

  // Payloads padrão (SocialwiseFlow)
  const socialwiseWhatsappPayload = {"session_id":"558597550136","message":"Queria saber mais sobre o mandado de segurança da OAB","channel_type":"Channel::Whatsapp","language":"pt_BR","context":{"message":{"id":36021,"content":"Queria saber mais sobre o mandado de segurança da OAB","account_id":3,"inbox_id":4,"conversation_id":2133,"message_type":"incoming","created_at":"2025-08-13T22:38:24.870Z","updated_at":"2025-08-13T22:38:24.870Z","private":false,"status":"sent","source_id":"wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FFOTRBNzA5ODRCNzhCNTEzNTEA","content_type":"text","content_attributes":{},"sender_type":"Contact","sender_id":1447,"external_source_ids":{},"additional_attributes":{},"processed_message_content":"Queria saber mais sobre o mandado de segurança da OAB","sentiment":{}},"conversation":{"id":2133,"account_id":3,"inbox_id":4,"status":"pending","assignee_id":null,"created_at":"2025-08-12T17:53:23.278Z","updated_at":"2025-08-13T22:38:24.873Z","contact_id":1447,"display_id":1923,"contact_last_seen_at":null,"agent_last_seen_at":"2025-08-12T18:57:06.792Z","additional_attributes":{},"contact_inbox_id":1690,"uuid":"08c5e7d4-9100-41bb-bf5b-c55a965cebcb","identifier":null,"last_activity_at":"2025-08-13T22:38:24.870Z","team_id":null,"campaign_id":null,"snoozed_until":null,"custom_attributes":{},"assignee_last_seen_at":null,"first_reply_created_at":null,"priority":null,"sla_policy_id":null,"waiting_since":"2025-08-12T17:53:23.278Z","cached_label_list":null,"label_list":[]},"contact":{"id":1447,"name":"Witalo Rocha","email":null,"phone_number":"+558597550136","account_id":3,"created_at":"2025-07-06T14:35:28.590Z","updated_at":"2025-08-13T22:38:24.940Z","additional_attributes":{},"identifier":null,"custom_attributes":{},"last_activity_at":"2025-08-13T22:38:24.932Z","contact_type":"lead","middle_name":"","last_name":"","location":null,"country_code":null,"blocked":false,"label_list":[]},"inbox":{"id":4,"channel_id":1,"account_id":3,"name":"WhatsApp - ANA","created_at":"2024-06-09T00:52:47.311Z","updated_at":"2025-08-13T21:50:09.580Z","channel_type":"Channel::Whatsapp","enable_auto_assignment":true,"greeting_enabled":false,"greeting_message":null,"email_address":null,"working_hours_enabled":false,"out_of_office_message":null,"timezone":"UTC","enable_email_collect":true,"csat_survey_enabled":false,"allow_messages_after_resolved":true,"auto_assignment_config":{},"lock_to_single_conversation":false,"portal_id":null,"sender_name_type":"friendly","business_name":null,"allow_agent_to_delete_message":true,"external_token":null,"csat_response_visible":false,"csat_config":{}},"socialwise-chatwit":{"whatsapp_identifiers":{"wamid":"wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FFOTRBNzA5ODRCNzhCNTEzNTEA","whatsapp_id":"wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FFOTRBNzA5ODRCNzhCNTEzNTEA","contact_source":"558597550136"},"contact_data":{"id":1447,"name":"Witalo Rocha","phone_number":"+558597550136","email":null,"identifier":null,"custom_attributes":{}},"conversation_data":{"id":2133,"status":"pending","assignee_id":null,"created_at":"2025-08-12T17:53:23Z","updated_at":"2025-08-13T22:38:24Z"},"message_data":{"id":36021,"content":"Queria saber mais sobre o mandado de segurança da OAB","content_type":"text","message_type":"incoming","created_at":"2025-08-13T22:38:24Z","interactive_data":{},"instagram_data":{}},"inbox_data":{"id":4,"name":"WhatsApp - ANA","channel_type":"Channel::Whatsapp"},"account_data":{"id":3,"name":"DraAmandaSousa"},"metadata":{"socialwise_active":true,"is_whatsapp_channel":true,"payload_version":"2.0","timestamp":"2025-08-13T22:38:25Z","has_whatsapp_api_key":true},"whatsapp_api_key":"EAAGIBII4GXQBO2qgvJ2jdcUmgkdqBo5bUKEanJWmCLpcZAsq0Ovpm4JNlrNLeZAv3OYNrdCqqQBAHfEfPFD0FPnZAOQJURB9GKcbXpa83XdAsa3i6fTr23lBFM2LwUZC23xXrZAnB8QjCCFZBxrxlBvzPj8LsejvUjz0C04Q8Jsl8nTGHUd4ZBRPc4NiHFnc","whatsapp_phone_number_id":"274633962398273","whatsapp_business_id":"294585820394901"},"wamid":"wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FFOTRBNzA5ODRCNzhCNTEzNTEA","contact_source":"558597550136","contact_name":"Witalo Rocha","contact_phone":"+558597550136","contact_email":null,"contact_identifier":null,"contact_id":1447,"conversation_id":2133,"conversation_status":"pending","conversation_assignee_id":null,"conversation_created_at":"2025-08-12T17:53:23Z","conversation_updated_at":"2025-08-13T22:38:24Z","message_id":36021,"message_content":"Queria saber mais sobre o mandado de segurança da OAB","message_type":"incoming","message_created_at":"2025-08-13T22:38:24Z","message_content_type":"text","button_id":null,"button_title":null,"list_id":null,"list_title":null,"list_description":null,"interaction_type":null,"postback_payload":null,"quick_reply_payload":null,"inbox_id":4,"inbox_name":"WhatsApp - ANA","channel_type":"Channel::Whatsapp","account_id":3,"account_name":"DraAmandaSousa","whatsapp_api_key":"EAAGIBII4GXQBO2qgvJ2jdcUmgkdqBo5bUKEanJWmCLpcZAsq0Ovpm4JNlrNLeZAv3OYNrdCqqQBAHfEfPFD0FPnZAOQJURB9GKcbXpa83XdAsa3i6fTr23lBFM2LwUZC23xXrZAnB8QjCCFZBxrxlBvzPj8LsejvUjz0C04Q8Jsl8nTGHUd4ZBRPc4NiHFnc","phone_number_id":"274633962398273","business_id":"294585820394901","socialwise_active":true,"is_whatsapp_channel":true,"has_whatsapp_api_key":true,"payload_version":"2.0","timestamp":"2025-08-13T22:38:25Z"}};

  const socialwiseWhatsappButtonPayload = {"session_id":"558597550136","message":"Falar com a Dra","channel_type":"Channel::Whatsapp","language":"pt_BR","context":{"message":{"id":36023,"content":"Falar com a Dra","account_id":3,"inbox_id":4,"conversation_id":2133,"message_type":"incoming","created_at":"2025-08-13T22:44:06.875Z","updated_at":"2025-08-13T22:44:06.875Z","private":false,"status":"sent","source_id":"wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FCNDNFNUMzMTJGQjc5RjcyOEQA","content_type":"text","content_attributes":{"button_reply":{"id":"btn_1754993780819_0_tqji","title":"Falar com a Dra"},"interaction_type":"button_reply","interactive_payload":{"type":"button_reply","button_reply":{"id":"btn_1754993780819_0_tqji","title":"Falar com a Dra"}}},"sender_type":"Contact","sender_id":1447,"external_source_ids":{},"additional_attributes":{},"processed_message_content":"Falar com a Dra","sentiment":{}},"conversation":{"id":2133,"account_id":3,"inbox_id":4,"status":"pending","assignee_id":null,"created_at":"2025-08-12T17:53:23.278Z","updated_at":"2025-08-13T22:44:06.877Z","contact_id":1447,"display_id":1923,"contact_last_seen_at":null,"agent_last_seen_at":"2025-08-12T18:57:06.792Z","additional_attributes":{},"contact_inbox_id":1690,"uuid":"08c5e7d4-9100-41bb-bf5b-c55a965cebcb","identifier":null,"last_activity_at":"2025-08-13T22:44:06.875Z","team_id":null,"campaign_id":null,"snoozed_until":null,"custom_attributes":{},"assignee_last_seen_at":null,"first_reply_created_at":null,"priority":null,"sla_policy_id":null,"waiting_since":"2025-08-12T17:53:23.278Z","cached_label_list":null,"label_list":[]},"contact":{"id":1447,"name":"Witalo Rocha","email":null,"phone_number":"+558597550136","account_id":3,"created_at":"2025-07-06T14:35:28.590Z","updated_at":"2025-08-13T22:44:06.926Z","additional_attributes":{},"identifier":null,"custom_attributes":{}},"inbox":{"id":4,"channel_id":1,"account_id":3,"name":"WhatsApp - ANA","created_at":"2024-06-09T00:52:47.311Z","updated_at":"2025-08-13T21:50:09.580Z","channel_type":"Channel::Whatsapp","enable_auto_assignment":true,"greeting_enabled":false,"greeting_message":null,"email_address":null,"working_hours_enabled":false,"out_of_office_message":null,"timezone":"UTC","enable_email_collect":true,"csat_survey_enabled":false,"allow_messages_after_resolved":true,"auto_assignment_config":{},"lock_to_single_conversation":false,"portal_id":null,"sender_name_type":"friendly","business_name":null,"allow_agent_to_delete_message":true,"external_token":null,"csat_response_visible":false,"csat_config":{}},"socialwise-chatwit":{"whatsapp_identifiers":{"wamid":"wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FCNDNFNUMzMTJGQjc5RjcyOEQA","whatsapp_id":"wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FCNDNFNUMzMTJGQjc5RjcyOEQA","contact_source":"558597550136"},"contact_data":{"id":1447,"name":"Witalo Rocha","phone_number":"+558597550136","email":null,"identifier":null,"custom_attributes":{}},"conversation_data":{"id":2133,"status":"pending","assignee_id":null,"created_at":"2025-08-12T17:53:23Z","updated_at":"2025-08-13T22:44:06Z"},"message_data":{"id":36023,"content":"Falar com a Dra","content_type":"text","message_type":"incoming","created_at":"2025-08-13T22:44:06Z","interactive_data":{"button_id":"btn_1754993780819_0_tqji","button_title":"Falar com a Dra","interaction_type":"button_reply"},"instagram_data":{}},"inbox_data":{"id":4,"name":"WhatsApp - ANA","channel_type":"Channel::Whatsapp"},"account_data":{"id":3,"name":"DraAmandaSousa"},"metadata":{"socialwise_active":true,"is_whatsapp_channel":true,"payload_version":"2.0","timestamp":"2025-08-13T22:44:07Z","has_whatsapp_api_key":true},"whatsapp_api_key":"EAAGIBII4GXQBO2qgvJ2jdcUmgkdqBo5bUKEanJWmCLpcZAsq0Ovpm4JNlrNLeZAv3OYNrdCqqQBAHfEfPFD0FPnZAOQJURB9GKcbjXeDpa83XdAsa3i6fTr23lBFM2LwUZC23xXrZAnB8QjCCFZBxrxlBvzPj8LsejvUjz0C04Q8Jsl8nTGHUd4ZBRPc4NiHFnc","whatsapp_phone_number_id":"274633962398273","whatsapp_business_id":"294585820394901"},"wamid":"wamid.HBgMNTU4NTk3NTUwMTM2FQIAEhgUM0FCNDNFNUMzMTJGQjc5RjcyOEQA","contact_source":"558597550136","contact_name":"Witalo Rocha","contact_phone":"+558597550136","contact_email":null,"contact_identifier":null,"contact_id":1447,"conversation_id":2133,"conversation_status":"pending","conversation_assignee_id":null,"conversation_created_at":"2025-08-12T17:53:23Z","conversation_updated_at":"2025-08-13T22:44:06Z","message_id":36023,"message_content":"Falar com a Dra","message_type":"incoming","message_created_at":"2025-08-13T22:44:06Z","message_content_type":"text","button_id":"btn_1754993780819_0_tqji","button_title":"Falar com a Dra","list_id":null,"list_title":null,"list_description":null,"interaction_type":null,"postback_payload":null,"quick_reply_payload":null,"inbox_id":4,"inbox_name":"WhatsApp - ANA","channel_type":"Channel::Whatsapp","account_id":3,"account_name":"DraAmandaSousa","whatsapp_api_key":"EAAGIBII4GXQBO2qgvJ2jdcUmgkdqBo5bUKEanJWmCLpcZAsq0Ovpm4JNlrNLeZAv3OYNrdCqqQBAHfEfPFD0FPnZAOQJURB9GKcbjXeDpa83XdAsa3i6fTr23lBFM2LwUZC23xXrZAnB8QjCCFZBxrxlBvzPj8LsejvUjz0C04Q8Jsl8nTGHUd4ZBRPc4NiHFnc","phone_number_id":"274633962398273","business_id":"294585820394901","socialwise_active":true,"is_whatsapp_channel":true,"has_whatsapp_api_key":true,"payload_version":"2.0","timestamp":"2025-08-13T22:44:07Z"}};

  const socialwiseInstagramPayload = {"session_id":"1002859634954741","message":"Bom dia mais informações sobre recurso da OAB","channel_type":"Channel::Instagram","language":"pt-BR","context":{"message":{"id":36027,"content":"Bom dia mais informações sobre recurso da OAB","account_id":3,"inbox_id":105,"conversation_id":2132,"message_type":"incoming","created_at":"2025-08-13T23:00:33.751Z","updated_at":"2025-08-13T23:00:33.751Z","private":false,"status":"sent","source_id":"aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDQ3NDk3Mzc2NjYxOjM0MDI4MjM2Njg0MTcxMDMwMTI0NDI1ODczNzUyMDkyNTU5MjcwNzozMjM3NjM2MDY3NjE3NzM3MDExMzg1NjczMDA5OTA4OTQwOAZDZD","content_type":"text","content_attributes":{"in_reply_to_external_id":null},"sender_type":"Contact","sender_id":1885,"external_source_ids":{},"additional_attributes":{},"processed_message_content":"Bom dia mais informações sobre recurso da OAB","sentiment":{}},"conversation":{"id":2132,"account_id":3,"inbox_id":105,"status":"pending","assignee_id":null,"created_at":"2025-08-12T17:30:10.706Z","updated_at":"2025-08-13T23:00:33.753Z","contact_id":1885,"display_id":1922,"contact_last_seen_at":null,"agent_last_seen_at":"2025-08-12T21:29:14.507Z","additional_attributes":{},"contact_inbox_id":2177,"uuid":"0d586852-6639-4bd1-b2c9-c6df07756e6f","identifier":null,"last_activity_at":"2025-08-13T23:00:33.751Z","team_id":null,"campaign_id":null,"snoozed_until":null,"custom_attributes":{},"assignee_last_seen_at":null,"first_reply_created_at":null,"priority":null,"sla_policy_id":null,"waiting_since":"2025-08-12T17:30:10.706Z","cached_label_list":null,"label_list":[]},"contact":{"id":1885,"name":"Witalo Rocha","email":null,"phone_number":null,"account_id":3,"created_at":"2025-07-25T11:02:03.286Z","updated_at":"2025-08-13T23:00:33.799Z","additional_attributes":{"social_profiles":{"instagram":"witalo_rocha_"},"social_instagram_user_name":"witalo_rocha_","social_instagram_follower_count":1262,"social_instagram_is_verified_user":false,"social_instagram_is_business_follow_user":true,"social_instagram_is_user_follow_business":true},"identifier":null,"custom_attributes":{},"last_activity_at":"2025-08-13T23:00:33.792Z","contact_type":"lead","middle_name":"","last_name":"","location":null,"country_code":null,"blocked":false,"label_list":[]},"inbox":{"id":105,"channel_id":4,"account_id":3,"name":"dra.amandasousadv","created_at":"2025-07-25T10:44:53.201Z","updated_at":"2025-07-25T10:44:53.201Z","channel_type":"Channel::Instagram","enable_auto_assignment":true,"greeting_enabled":false,"greeting_message":null,"email_address":null,"working_hours_enabled":false,"out_of_office_message":null,"timezone":"UTC","enable_email_collect":true,"csat_survey_enabled":false,"allow_messages_after_resolved":true,"auto_assignment_config":{},"lock_to_single_conversation":false,"portal_id":null,"sender_name_type":"friendly","business_name":null,"allow_agent_to_delete_message":true,"external_token":null,"csat_response_visible":false,"csat_config":{}},"socialwise-chatwit":{"whatsapp_identifiers":{"wamid":"aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDQ3NDk3Mzc2NjYxOjM0MDI4MjM2Njg0MTcxMDMwMTI0NDI1ODczNzUyMDkyNTU5MjcwNzozMjM3NjM2MDY3NjE3NzM3MDExMzg1NjczMDA5OTA4OTQwOAZDZD","whatsapp_id":"aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDQ3NDk3Mzc2NjYxOjM0MDI4MjM2Njg0MTcxMDMwMTI0NDI1ODczNzUyMDkyNTU5MjcwNzozMjM3NjM2MDY3NjE3NzM3MDExMzg1NjczMDA5OTA4OTQwOAZDZD","contact_source":"1002859634954741"},"contact_data":{"id":1885,"name":"Witalo Rocha","phone_number":null,"email":null,"identifier":null,"custom_attributes":{}},"conversation_data":{"id":2132,"status":"pending","assignee_id":null,"created_at":"2025-08-12T17:30:10Z","updated_at":"2025-08-13T23:00:33Z"},"message_data":{"id":36027,"content":"Bom dia mais informações sobre recurso da OAB","content_type":"text","message_type":"incoming","created_at":"2025-08-13T23:00:33Z","interactive_data":{},"instagram_data":{}},"inbox_data":{"id":105,"name":"dra.amandasousadv","channel_type":"Channel::Instagram"},"account_data":{"id":3,"name":"DraAmandaSousa"},"metadata":{"socialwise_active":true,"is_whatsapp_channel":false,"payload_version":"2.0","timestamp":"2025-08-13T23:00:33Z","has_whatsapp_api_key":false},"whatsapp_api_key":null,"whatsapp_phone_number_id":null,"whatsapp_business_id":null},"wamid":"aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDQ3NDk3Mzc2NjYxOjM0MDI4MjM2Njg0MTcxMDMwMTI0NDI1ODczNzUyMDkyNTU5MjcwNzozMjM3NjM2MDY3NjE3NzM3MDExMzg1NjczMDA5OTA4OTQwOAZDZD","contact_source":"1002859634954741","contact_name":"Witalo Rocha","contact_phone":null,"contact_email":null,"contact_identifier":null,"contact_id":1885,"conversation_id":2132,"conversation_status":"pending","conversation_assignee_id":null,"conversation_created_at":"2025-08-12T17:30:10Z","conversation_updated_at":"2025-08-13T23:00:33Z","message_id":36027,"message_content":"Bom dia mais informações sobre recurso da OAB","message_type":"incoming","message_created_at":"2025-08-13T23:00:33Z","message_content_type":"text","button_id":null,"button_title":null,"list_id":null,"list_title":null,"list_description":null,"interaction_type":null,"postback_payload":null,"quick_reply_payload":null,"inbox_id":105,"inbox_name":"dra.amandasousadv","channel_type":"Channel::Instagram","account_id":3,"account_name":"DraAmandaSousa","whatsapp_api_key":null,"phone_number_id":null,"business_id":null,"socialwise_active":true,"is_whatsapp_channel":false,"has_whatsapp_api_key":false,"payload_version":"2.0","timestamp":"2025-08-13T23:00:33Z"}};

  const socialwiseInstagramButtonPayload = {"session_id":"1002859634954741","message":"Falar com a Dra","channel_type":"Channel::Instagram","language":"pt-BR","context":{"message":{"id":36029,"content":"Falar com a Dra","account_id":3,"inbox_id":105,"conversation_id":2132,"message_type":"incoming","created_at":"2025-08-13T23:02:06.966Z","updated_at":"2025-08-13T23:02:06.966Z","private":false,"status":"sent","source_id":"aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDQ3NDk3Mzc2NjYxOjM0MDI4MjM2Njg0MTcxMDMwMTI0NDI1ODczNzUyMDkyNTU5MjcwNzozMjM3NjM2MjQzNzg0OTM0MjgwNjMyNjUzMDgyNDczMjY3MgZDZD","content_type":"text","content_attributes":{"in_reply_to_external_id":null,"postback_payload":"ig_btn_1755004696546_uekaa4clu"},"sender_type":"Contact","sender_id":1885,"external_source_ids":{},"additional_attributes":{},"processed_message_content":"Falar com a Dra","sentiment":{}},"conversation":{"id":2132,"account_id":3,"inbox_id":105,"status":"pending","assignee_id":null,"created_at":"2025-08-12T17:30:10.706Z","updated_at":"2025-08-13T23:02:06.968Z","contact_id":1885,"display_id":1922,"contact_last_seen_at":null,"agent_last_seen_at":"2025-08-12T21:29:14.507Z","additional_attributes":{},"contact_inbox_id":2177,"uuid":"0d586852-6639-4bd1-b2c9-c6df07756e6f","identifier":null,"last_activity_at":"2025-08-13T23:02:06.966Z","team_id":null,"campaign_id":null,"snoozed_until":null,"custom_attributes":{},"assignee_last_seen_at":null,"first_reply_created_at":null,"priority":null,"sla_policy_id":null,"waiting_since":"2025-08-12T17:30:10.706Z","cached_label_list":null,"label_list":[]},"contact":{"id":1885,"name":"Witalo Rocha","email":null,"phone_number":null,"account_id":3,"created_at":"2025-07-25T11:02:03.286Z","updated_at":"2025-08-13T23:02:07.005Z","additional_attributes":{"social_profiles":{"instagram":"witalo_rocha_"},"social_instagram_user_name":"witalo_rocha_","social_instagram_follower_count":1262,"social_instagram_is_verified_user":false,"social_instagram_is_business_follow_user":true,"social_instagram_is_user_follow_business":true},"identifier":null,"custom_attributes":{},"last_activity_at":"2025-08-13T23:02:07.002Z","contact_type":"lead","middle_name":"","last_name":"","location":null,"country_code":null,"blocked":false,"label_list":[]},"inbox":{"id":105,"channel_id":4,"account_id":3,"name":"dra.amandasousadv","created_at":"2025-07-25T10:44:53.201Z","updated_at":"2025-07-25T10:44:53.201Z","channel_type":"Channel::Instagram","enable_auto_assignment":true,"greeting_enabled":false,"greeting_message":null,"email_address":null,"working_hours_enabled":false,"out_of_office_message":null,"timezone":"UTC","enable_email_collect":true,"csat_survey_enabled":false,"allow_messages_after_resolved":true,"auto_assignment_config":{},"lock_to_single_conversation":false,"portal_id":null,"sender_name_type":"friendly","business_name":null,"allow_agent_to_delete_message":true,"external_token":null,"csat_response_visible":false,"csat_config":{}},"socialwise-chatwit":{"whatsapp_identifiers":{"wamid":"aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDQ3NDk3Mzc2NjYxOjM0MDI4MjM2Njg0MTcxMDMwMTI0NDI1ODczNzUyMDkyNTU5MjcwNzozMjM3NjM2MjQzNzg0OTM0MjgwNjMyNjUzMDgyNDczMjY3MgZDZD","whatsapp_id":"aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDQ3NDk3Mzc2NjYxOjM0MDI4MjM2Njg0MTcxMDMwMTI0NDI1ODczNzUyMDkyNTU5MjcwNzozMjM3NjM2MjQzNzg0OTM0MjgwNjMyNjUzMDgyNDczMjY3MgZDZD","contact_source":"1002859634954741"},"contact_data":{"id":1885,"name":"Witalo Rocha","phone_number":null,"email":null,"identifier":null,"custom_attributes":{}},"conversation_data":{"id":2132,"status":"pending","assignee_id":null,"created_at":"2025-08-12T17:30:10Z","updated_at":"2025-08-13T23:02:06Z"},"message_data":{"id":36029,"content":"Falar com a Dra","content_type":"text","message_type":"incoming","created_at":"2025-08-13T23:02:06Z","interactive_data":{},"instagram_data":{"postback_payload":"ig_btn_1755004696546_uekaa4clu","interaction_type":"postback"}},"inbox_data":{"id":105,"name":"dra.amandasousadv","channel_type":"Channel::Instagram"},"account_data":{"id":3,"name":"DraAmandaSousa"},"metadata":{"socialwise_active":true,"is_whatsapp_channel":false,"payload_version":"2.0","timestamp":"2025-08-13T23:02:07Z","has_whatsapp_api_key":false},"whatsapp_api_key":null,"whatsapp_phone_number_id":null,"whatsapp_business_id":null},"wamid":"aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDQ3NDk3Mzc2NjYxOjM0MDI4MjM2Njg0MTcxMDMwMTI0NDI1ODczNzUyMDkyNTU5MjcwNzozMjM3NjM2MjQzNzg0OTM0MjgwNjMyNjUzMDgyNDczMjY3MgZDZD","contact_source":"1002859634954741","contact_name":"Witalo Rocha","contact_phone":null,"contact_email":null,"contact_identifier":null,"contact_id":1885,"conversation_id":2132,"conversation_status":"pending","conversation_assignee_id":null,"conversation_created_at":"2025-08-12T17:30:10Z","conversation_updated_at":"2025-08-13T23:02:06Z","message_id":36029,"message_content":"Falar com a Dra","message_type":"incoming","message_created_at":"2025-08-13T23:02:06Z","message_content_type":"text","button_id":null,"button_title":null,"list_id":null,"list_title":null,"list_description":null,"interaction_type":"postback","postback_payload":"ig_btn_1755004696546_uekaa4clu","quick_reply_payload":null,"inbox_id":105,"inbox_name":"dra.amandasousadv","channel_type":"Channel::Instagram","account_id":3,"account_name":"DraAmandaSousa","whatsapp_api_key":null,"phone_number_id":null,"business_id":null,"socialwise_active":true,"is_whatsapp_channel":false,"has_whatsapp_api_key":false,"payload_version":"2.0","timestamp":"2025-08-13T23:02:07Z"}};

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <TestTube className="h-8 w-8 text-blue-500" />
        <div>
          <h1 className="text-3xl font-bold">Teste de Webhook Dialogflow</h1>
          <p className="text-muted-foreground">
            Teste o webhook do MTF Diamante com payloads reais do Dialogflow
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
            <CardDescription>
              Status atual do sistema de respostas rápidas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2">
                {flashIntentStatus.enabled ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm">
                  Global: {flashIntentStatus.enabled ? "Ativa" : "Inativa"}
                </span>
              </div>
              
              {Object.entries(flashIntentStatus.components).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  {value ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="text-xs">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                </div>
              ))}
            </div>
            
            {flashIntentStatus.enabled ? (
              <div className="mt-3 p-2 bg-green-50 rounded-md">
                <p className="text-sm text-green-700">
                  ⚡ Flash Intent está ativa! Os testes usarão processamento de alta prioridade.
                </p>
              </div>
            ) : (
              <div className="mt-3 p-2 bg-yellow-50 rounded-md">
                <p className="text-sm text-yellow-700">
                  🐌 Flash Intent está inativa. Os testes usarão processamento padrão.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Configurações */}
      <Card>
        <CardHeader>
          <CardTitle>Configurações do Teste</CardTitle>
          <CardDescription>
            Configure o número de telefone que receberá a mensagem de teste e um destino externo opcional
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

            {/* Destino customizado */}
            <div>
              <label htmlFor="externalDest" className="text-sm font-medium flex items-center gap-2">
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
          </div>
        </CardContent>
      </Card>

      {/* Testes Rápidos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Button Click Real
            </CardTitle>
            <CardDescription>
              Testa com o payload real fornecido (button_reply)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Badge variant="outline">Intent: Finalizar</Badge>
              <Badge variant="outline">Type: button_reply</Badge>
              <Badge variant="outline">Button ID: btn_1753326794020_tbc27gtbw</Badge>
              <Button 
                onClick={sendRealPayload} 
                disabled={loading}
                className="w-full"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Testar Button Click
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5 text-blue-500" />
              Intent Test
            </CardTitle>
            <CardDescription>
              Testa com um intent simples (modificado do payload real)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Badge variant="outline">Intent: Welcome</Badge>
              <Badge variant="outline">Type: intent</Badge>
              <Badge variant="outline">Text: Olá</Badge>
              <Button 
                onClick={createIntentPayload} 
                disabled={loading}
                className="w-full"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Testar Intent
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5 text-green-500" />
              Payload Real
            </CardTitle>
            <CardDescription>
              Copie o payload real para análise
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Badge variant="outline">JSON Completo</Badge>
              <Badge variant="outline">Pronto para usar</Badge>
              <Button 
                onClick={copyPayload} 
                variant="outline"
                className="w-full"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copiar Payload
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Enviar para destino customizado (cargas padrão) */}
      <Card>
        <CardHeader>
          <CardTitle>Cargas padrão para destino customizado</CardTitle>
          <CardDescription>
            Envie rapidamente exemplos prontos para o destino configurado acima
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Button disabled={loading} onClick={() => sendToExternal(socialwiseWhatsappPayload)}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />} WhatsApp (mensagem)
            </Button>
            <Button disabled={loading} onClick={() => sendToExternal(socialwiseWhatsappButtonPayload)}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />} WhatsApp (clique de botão)
            </Button>
            <Button disabled={loading} onClick={() => sendToExternal(socialwiseInstagramPayload)}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />} Instagram (mensagem)
            </Button>
            <Button disabled={loading} onClick={() => sendToExternal(socialwiseInstagramButtonPayload)}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />} Instagram (clique de botão)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payload Customizado */}
      <Card>
        <CardHeader>
          <CardTitle>Payload Customizado</CardTitle>
          <CardDescription>
            Cole um payload JSON customizado para testar ou salve para uso posterior
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Cole aqui um payload JSON do Dialogflow..."
            value={customPayload}
            onChange={(e) => setCustomPayload(e.target.value)}
            className="min-h-[200px] font-mono text-sm"
          />
          
          {/* Controles do Payload */}
          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={sendCustomPayload} 
              disabled={loading || !customPayload.trim()}
              variant="outline"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar Payload Customizado
            </Button>
            <Button 
              onClick={() => {
                try { const p = JSON.parse(customPayload); sendToExternal(p); } catch { toast.error("JSON inválido"); }
              }}
              disabled={loading || !customPayload.trim()}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar para Destino Customizado
            </Button>
            
            <div className="flex gap-2">
              <Input
                placeholder="Nome do payload"
                value={payloadName}
                onChange={(e) => setPayloadName(e.target.value)}
                className="w-48"
              />
              <Button 
                onClick={savePayload}
                disabled={!customPayload.trim() || !payloadName.trim()}
                variant="secondary"
                size="sm"
              >
                <Save className="h-4 w-4 mr-2" />
                Salvar
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
            <CardDescription>
              Payloads salvos para uso rápido
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {savedPayloads.map((payload) => (
                <div key={payload.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm truncate">{payload.name}</h4>
                    <Button
                      onClick={() => deletePayload(payload.id)}
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Criado em {new Date(payload.createdAt).toLocaleDateString()}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      onClick={() => loadPayload(payload)}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <FolderOpen className="h-3 w-3 mr-1" />
                      Carregar
                    </Button>
                    <Button
                      onClick={() => {
                        setCustomPayload(payload.payload);
                        sendCustomPayload();
                      }}
                      variant="default"
                      size="sm"
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resposta */}
      {response && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Resposta do Webhook
              <Badge variant={response.status === 200 || response.status === 202 ? "default" : "destructive"}>
                {response.status || "Error"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Resposta recebida em {response.timestamp}{response.target ? ` • Destino: ${response.target}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {response.testInfo && (
                <div>
                  <h4 className="font-medium mb-2">Informações do Teste:</h4>
                  <div className="bg-blue-50 p-3 rounded-md">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><strong>Telefone:</strong> {response.testInfo.phoneNumber}</div>
                      <div><strong>Tipo:</strong> {response.testInfo.payloadType}</div>
                      <div><strong>Intent:</strong> {response.testInfo.intentName}</div>
                      <div><strong>Button ID:</strong> {response.testInfo.buttonId || "N/A"}</div>
                      <div><strong>Tempo de Resposta:</strong> {response.responseTime}ms</div>
                      <div><strong>Timestamp:</strong> {new Date(response.testInfo.timestamp).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              )}

              {response.cacheInfo && (
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    Status do Cache
                    {response.cacheInfo.cleared ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-400" />
                    )}
                  </h4>
                  <div className={`p-3 rounded-md ${
                    response.cacheInfo.cleared ? 'bg-green-50' : 'bg-gray-50'
                  }`}>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><strong>Limpeza Solicitada:</strong> {response.cacheInfo.requested ? 'Sim' : 'Não'}</div>
                      <div><strong>Cache Limpo:</strong> {response.cacheInfo.cleared ? 'Sim' : 'Não'}</div>
                      {response.cacheInfo.result && (
                        <>
                          <div><strong>Chaves Removidas:</strong> {response.cacheInfo.result.totalKeysCleared || 0}</div>
                          <div><strong>Tipos Limpos:</strong> {response.cacheInfo.result.cacheTypesCleared?.join(', ') || 'N/A'}</div>
                        </>
                      )}
                    </div>
                    {response.cacheInfo.result?.details && (
                      <div className="mt-2 text-xs text-gray-600">
                        <strong>Detalhes:</strong> {JSON.stringify(response.cacheInfo.result.details, null, 2)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {response.headers && (
                <div>
                  <h4 className="font-medium mb-2">Headers do Webhook:</h4>
                  <div className="bg-muted p-3 rounded-md">
                    <pre className="text-sm">
                      {Object.entries(response.headers)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join('\n')}
                    </pre>
                  </div>
                </div>
              )}
              
              <div>
                <h4 className="font-medium mb-2">Response Body:</h4>
                <div className="bg-muted p-3 rounded-md max-h-96 overflow-auto">
                  <pre className="text-sm">
                    {JSON.stringify(response.data || response.error, null, 2)}
                  </pre>
                </div>
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
            Detalhes extraídos do payload fornecido
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium mb-2">Dados do Contato:</h4>
              <ul className="space-y-1">
                <li><strong>Nome:</strong> Witalo Rocha</li>
                <li><strong>Telefone:</strong> +558597550136</li>
                <li><strong>Contact ID:</strong> 1447</li>
                <li><strong>Conversation ID:</strong> 1988</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Dados do WhatsApp:</h4>
              <ul className="space-y-1">
                <li><strong>Business ID:</strong> 294585820394901</li>
                <li><strong>Phone Number ID:</strong> 274633962398273</li>
                <li><strong>Inbox ID:</strong> 4</li>
                <li><strong>WAMID:</strong> wamid.HBgMNTU4NTk3...</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Dados da Interação:</h4>
              <ul className="space-y-1">
                <li><strong>Tipo:</strong> button_reply</li>
                <li><strong>Intent:</strong> Finalizar</li>
                <li><strong>Button ID:</strong> btn_1753326794020_tbc27gtbw</li>
                <li><strong>Button Title:</strong> Finalizar</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Dados da Conta:</h4>
              <ul className="space-y-1">
                <li><strong>Account Name:</strong> DraAmandaSousa</li>
                <li><strong>Account ID:</strong> 3</li>
                <li><strong>Inbox Name:</strong> WhatsApp - ANA</li>
                <li><strong>Channel:</strong> Channel::Whatsapp</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}