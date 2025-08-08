"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, TestTube, Zap, Copy, CheckCircle, XCircle, Save, FolderOpen, Trash2 } from "lucide-react";
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
          timestamp: new Date().toISOString(),
        });
      } else {
        setResponse({
          status: response.status,
          statusText: response.statusText,
          data: responseData,
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
            Configure o número de telefone que receberá a mensagem de teste
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
              Resposta recebida em {response.timestamp}
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