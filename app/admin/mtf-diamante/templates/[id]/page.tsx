// app/admin/mtf-diamante/templates/[id]/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { toast } from "sonner";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  AlertCircle,
  ArrowLeft,
  Trash2,
  CheckCircle,
  Copy,
  Phone,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SendProgressDialog } from "../../components/TemplatesTab/components/send-progress-dialog";
import { LeadsSelectorDialog } from "../../components/TemplatesTab/components/leads-selector-dialog";

interface TemplateDetail {
  id: string;
  name: string;
  category: string;
  subCategory?: string | null;
  status: string;
  language: string;
  qualityScore?: string | null;
  correctCategory?: string | null;
  ctaUrlLinkTrackingOptedOut?: boolean | null;
  libraryTemplateName?: string | null;
  messageSendTtlSeconds?: number | null;
  parameterFormat?: string | null;
  previousCategory?: string | null;
  lastEdited?: string | null;
  publicMediaUrl?: string | null;
  componentes: Array<{
    type: string;
    format?: string;
    text?: string;
    parameters?: Array<{
      type: string;
      example: string;
    }>;
    buttons?: Array<{
      type: string;
      text: string;
      url?: string | null;
      phone_number?: string | null;
      example?: string[];
    }>;
    example?: any;
  }>;
}

interface TemplateDetailsPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function TemplateDetailsPage({
  params,
}: TemplateDetailsPageProps) {
  const resolvedParams = await params;
  const templateId = resolvedParams.id;

  return <TemplateDetailsClient templateId={templateId} />;
}

function TemplateDetailsClient({ templateId }: { templateId: string }) {
  const router = useRouter();
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [testVariables, setTestVariables] = useState<string[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [headerMedia, setHeaderMedia] = useState("");
  const [hasHeaderMedia, setHasHeaderMedia] = useState(false);

  const [isSending, setIsSending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMassSending, setIsMassSending] = useState(false);
  const [contactList, setContactList] = useState<
    { nome: string; numero: string }[]
  >([]);
  const [showSendProgress, setShowSendProgress] = useState(false);
  const [sendProgressComplete, setSendProgressComplete] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLeadsSelector, setShowLeadsSelector] = useState(false);

  useEffect(() => {
    async function fetchTemplate() {
      if (!templateId) {
        setError("ID do template não fornecido");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        console.log("Buscando template com ID:", templateId);

        const res = await axios
          .get(`/api/admin/mtf-diamante/template-info?template=${templateId}`)
          .catch((error) => {
            console.error("Erro na requisição:", error);
            throw new Error(
              error.response?.data?.error ||
                error.response?.data?.details ||
                error.message ||
                "Falha na comunicação com o servidor"
            );
          });

        if (!res.data.success) {
          setError(res.data.details || "Erro ao carregar template");
          return;
        }

        const t = res.data.template;
        setTemplate({
          id: templateId,
          name: t.name,
          category: t.category,
          subCategory: t.sub_category,
          status: t.status,
          language: t.language,
          qualityScore:
            typeof t.quality_score === "string" ? t.quality_score : null,
          correctCategory: t.correct_category,
          ctaUrlLinkTrackingOptedOut: t.cta_url_link_tracking_opted_out,
          libraryTemplateName: t.library_template_name,
          messageSendTtlSeconds: t.message_send_ttl_seconds,
          parameterFormat: t.parameter_format,
          previousCategory: t.previous_category,
          lastEdited: t.lastEdited,
          publicMediaUrl: t.publicMediaUrl,
          componentes: t.components || [],
        });

        // variáveis do BODY
        const bodyComp = t.components?.find((c: any) => c.type === "BODY");
        if (bodyComp && Array.isArray(bodyComp.parameters)) {
          setTestVariables(
            bodyComp.parameters.map((v: any) => v.example || "")
          );
        }

        // HEADER media
        const hdr = t.components?.find(
          (c: any) =>
            c.type === "HEADER" &&
            ["VIDEO", "IMAGE", "DOCUMENT", "LOCATION"].includes(c.format)
        );
        if (hdr) {
          setHasHeaderMedia(true);
          // Usar a URL pública do MinIO se disponível, caso contrário usar a URL da Meta
          let mediaUrl = t.publicMediaUrl;

          if (!mediaUrl) {
            mediaUrl =
              hdr.example?.header_handle?.[0] ||
              hdr.example?.header_url ||
              (typeof hdr.example?.header_location === "object"
                ? JSON.stringify(hdr.example.header_location)
                : "");
          }

          setHeaderMedia(mediaUrl);
        }

        // pré‑preenche cupom do COPY_CODE
        const btnComp = t.components?.find((c: any) => c.type === "BUTTONS");
        if (btnComp?.buttons) {
          const copyBtn = btnComp.buttons.find(
            (b: any) => b.type === "COPY_CODE"
          );
          if (copyBtn?.example?.length) {
            setCouponCode(copyBtn.example[0]);
          }
        }
      } catch (err) {
        console.error(err);
        setError("Erro ao carregar informações do template");
      } finally {
        setIsLoading(false);
      }
    }

    fetchTemplate();
  }, [templateId]);

  const handleTestSend = async () => {
    if (!template) return;
    setIsSending(true);
    try {
      let phone = testPhoneNumber.replace(/\D/g, "");
      if (!phone.startsWith("55")) phone = "55" + phone;

      const payload = {
        templateId: template.id,
        selectedLeads: [phone],
      };

      const res = await axios.post("/api/admin/mtf-diamante/disparo", payload);
      if (res.data.success) toast.success("Enviado!");
      else toast.error(res.data.error || "Falha no envio");
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async () => {
    if (!template) return;
    setIsDeleting(true);
    setShowDeleteDialog(false);

    try {
      const res = await axios.delete("/api/admin/mtf-diamante/templates", {
        data: { name: template.name },
      });
      if (res.data.success) {
        toast.success("Template excluído");
        router.push("/admin/mtf-diamante");
      } else {
        toast.error(res.data.error);
      }
    } catch {
      toast.error("Erro ao excluir template");
    } finally {
      setIsDeleting(false);
    }
  };

  function getMediaSourceLabel(
    url: string,
    publicMediaUrl: string | null | undefined
  ) {
    if (!url) return "";
    if (publicMediaUrl && url === publicMediaUrl) {
      return "Armazenada no MinIO";
    }
    if (url.includes("whatsapp.net") || url.includes("fbcdn.net")) {
      return "Hospedada nos servidores da Meta";
    }
    return "";
  }

  const handleMassSend = async () => {
    if (!template || contactList.length === 0) return;
    setShowSendProgress(true);
    setSendProgressComplete(false);
    setIsMassSending(true);
    try {
      const selectedLeads = contactList.map((contact) => {
        let numero = contact.numero.replace(/\D/g, "");
        if (!numero.startsWith("55")) numero = "55" + numero;
        return numero;
      });
      const payload = {
        templateId: template.id,
        selectedLeads,
      };
      console.log(
        `Enviando mensagem para ${selectedLeads.length} leads:`,
        payload
      );
      const response = await axios.post(
        "/api/admin/mtf-diamante/disparo",
        payload
      );
      if (response.data.success) {
        setSendProgressComplete(true);
        toast.success(
          `Mensagens enviadas com sucesso para ${selectedLeads.length} leads!`
        );
      } else {
        setShowSendProgress(false);
        toast.error(
          response.data.error || "Falha ao enviar mensagens em massa"
        );
      }
    } catch (error: any) {
      console.error("Erro ao enviar mensagens em massa:", error);
      setShowSendProgress(false);
      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Erro ao enviar mensagens"
      );
    } finally {
      setIsMassSending(false);
    }
  };

  const handleLeadsSelection = (selectedLeads: any[]) => {
    const contacts = selectedLeads
      .map((lead) => ({
        nome: lead.nomeReal || lead.name || "Lead sem nome",
        numero: lead.phoneNumber || "",
      }))
      .filter((contact) => contact.numero);

    setContactList(contacts);
    toast.success(`${contacts.length} leads selecionados da base de dados!`);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-[60vh]">
        <DotLottieReact
          src="/animations/loading.lottie"
          autoplay
          loop
          style={{ width: 150, height: 150 }}
          aria-label="Carregando informações do template"
        />
        <p className="mt-4 text-muted-foreground">
          Carregando informações do template...
        </p>
      </div>
    );
  }

  if (error || !template) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Erro</AlertTitle>
        <AlertDescription>
          {error || "Template não encontrado"}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-10 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <Link href="/admin/mtf-diamante">
          <Button variant="ghost" size="icon">
            <ArrowLeft />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold truncate">{template.name}</h1>
        <div className="space-x-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="animate-spin h-4 w-4 mr-1" />
            ) : (
              <Trash2 className="mr-1 h-4 w-4" />
            )}
            Excluir
          </Button>
        </div>
      </div>

      {/* Conteúdo e envio */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Visão do template */}
          <Card>
            <CardHeader>
              <CardTitle>Conteúdo do Template</CardTitle>
              <CardDescription>Visualização</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="visual">
                <TabsList>
                  <TabsTrigger value="visual">Visual</TabsTrigger>
                  <TabsTrigger value="json">JSON</TabsTrigger>
                </TabsList>
                <TabsContent value="visual">
                  <div className="border rounded-lg overflow-hidden">
                    {/* Fundo de chat do WhatsApp */}
                    <div
                      className="relative p-3 min-h-[400px]"
                      style={{
                        backgroundImage: "url('/fundo_whatsapp.jpg')",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    >
                      {/* Mensagem de template */}
                      <div className="max-w-[85%] bg-white rounded-lg shadow-sm p-3 ml-auto mr-3 mb-3">
                        {/* Header */}
                        {template.componentes.map(
                          (c, i) =>
                            c.type === "HEADER" && (
                              <div key={i}>
                                {c.format === "TEXT" && c.text && (
                                  <div className="font-bold text-center mb-2">
                                    {c.text}
                                  </div>
                                )}
                                {c.format === "IMAGE" && (
                                  <div
                                    className="mb-2 overflow-hidden rounded-md"
                                    style={{ maxHeight: "180px" }}
                                  >
                                    {headerMedia ? (
                                      <img
                                        src={headerMedia}
                                        alt="Header"
                                        className="w-full object-contain rounded-md max-h-[160px]"
                                      />
                                    ) : (
                                      <div
                                        className="w-full bg-gray-200 flex items-center justify-center"
                                        style={{ height: "140px" }}
                                      >
                                        <svg
                                          className="w-12 h-12 text-gray-400"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                          xmlns="http://www.w3.org/2000/svg"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth="2"
                                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                          ></path>
                                        </svg>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                        )}

                        {/* Body */}
                        {template.componentes.map(
                          (c, i) =>
                            c.type === "BODY" &&
                            c.text && (
                              <div
                                key={i}
                                className="text-sm whitespace-pre-line mb-2"
                              >
                                {c.text}
                              </div>
                            )
                        )}

                        {/* Footer */}
                        {template.componentes.map(
                          (c, i) =>
                            c.type === "FOOTER" &&
                            c.text && (
                              <div
                                key={i}
                                className="text-xs text-gray-500 mb-2"
                              >
                                {c.text}
                              </div>
                            )
                        )}

                        <div className="text-right text-xs text-gray-500 flex justify-end items-center">
                          <span>17:12</span>
                        </div>
                      </div>

                      {/* Botões abaixo da mensagem */}
                      {template.componentes.map(
                        (c, i) =>
                          c.type === "BUTTONS" &&
                          c.buttons &&
                          c.buttons.length > 0 && (
                            <div
                              key={i}
                              className="bg-white rounded-lg shadow-sm max-w-[85%] ml-auto mr-3 mt-1 overflow-hidden"
                            >
                              <div className="divide-y divide-gray-100">
                                {c.buttons.map((button, index) => (
                                  <button
                                    key={index}
                                    className="w-full py-3 px-4 text-sm text-cyan-500 font-medium text-center flex justify-center items-center"
                                  >
                                    {button.type === "URL" && (
                                      <ExternalLink className="h-4 w-4 mr-2" />
                                    )}
                                    {button.type === "COPY_CODE" && (
                                      <Copy className="h-4 w-4 mr-2" />
                                    )}
                                    {button.type === "PHONE_NUMBER" && (
                                      <Phone className="h-4 w-4 mr-2" />
                                    )}
                                    {button.text}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )
                      )}
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="json">
                  <pre className="bg-muted p-4 rounded overflow-auto text-xs max-h-[400px]">
                    {JSON.stringify(template.componentes, null, 2)}
                  </pre>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Enviar teste */}
          <Card>
            <CardHeader>
              <CardTitle>Enviar Mensagem</CardTitle>
              <CardDescription>Testes e envios</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="individual">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="individual">
                    Mensagem de Teste
                  </TabsTrigger>
                  <TabsTrigger value="massa">Envio em Massa</TabsTrigger>
                </TabsList>

                <TabsContent value="individual" className="space-y-4">
                  <div>
                    <Label htmlFor="phone">Número (com DDD)</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="11999999999"
                      value={testPhoneNumber}
                      onChange={(e) => setTestPhoneNumber(e.target.value)}
                    />
                  </div>

                  {template.componentes.some((c) =>
                    Array.isArray(c.parameters)
                  ) && (
                    <div>
                      <p className="font-medium mb-2">Variáveis</p>
                      <div className="space-y-2">
                        {testVariables.map((val, idx) => (
                          <div
                            key={idx}
                            className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center"
                          >
                            <Label className="text-xs sm:text-sm truncate">
                              {"{{" +
                                template.componentes.flatMap((c) =>
                                  Array.isArray(c.parameters)
                                    ? c.parameters
                                    : []
                                )[idx]?.type +
                                "}}"}
                            </Label>
                            <div className="sm:col-span-3">
                              <Input
                                placeholder={
                                  template.componentes.flatMap((c) =>
                                    Array.isArray(c.parameters)
                                      ? c.parameters
                                      : []
                                  )[idx]?.example
                                }
                                value={testVariables[idx]}
                                onChange={(e) => {
                                  const arr = [...testVariables];
                                  arr[idx] = e.target.value;
                                  setTestVariables(arr);
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {hasHeaderMedia && (
                    <div>
                      <Label>Mídia do cabeçalho</Label>
                      <Input
                        placeholder="https://... ou ID"
                        value={headerMedia}
                        onChange={(e) => setHeaderMedia(e.target.value)}
                      />
                      {headerMedia && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {getMediaSourceLabel(
                            headerMedia,
                            template?.publicMediaUrl
                          )}
                          {template?.publicMediaUrl &&
                            headerMedia !== template.publicMediaUrl && (
                              <Button
                                variant="link"
                                className="p-0 h-auto text-xs"
                                onClick={() =>
                                  setHeaderMedia(template.publicMediaUrl || "")
                                }
                              >
                                Usar cópia local
                              </Button>
                            )}
                        </p>
                      )}
                    </div>
                  )}

                  {template.componentes.some(
                    (c) =>
                      c.type === "BUTTONS" &&
                      c.buttons?.some((b) => b.type === "COPY_CODE")
                  ) && (
                    <div>
                      <Label>Cupom (copy_code)</Label>
                      <Input
                        placeholder="CODE123"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                      />
                    </div>
                  )}

                  <Button
                    onClick={handleTestSend}
                    disabled={isSending || !testPhoneNumber}
                    className="w-full"
                  >
                    {isSending ? (
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    ) : null}
                    Enviar Teste
                  </Button>
                </TabsContent>

                <TabsContent value="massa" className="space-y-4">
                  <div className="space-y-4">
                    <Button
                      onClick={() => setShowLeadsSelector(true)}
                      variant="outline"
                      className="w-full"
                    >
                      Selecionar Leads da Base
                    </Button>

                    {contactList.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">
                          {contactList.length} contatos selecionados
                        </p>
                        <Button
                          onClick={handleMassSend}
                          disabled={isMassSending}
                          className="w-full"
                        >
                          {isMassSending ? (
                            <Loader2 className="animate-spin h-4 w-4 mr-2" />
                          ) : null}
                          Enviar para Todos
                        </Button>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o template "{template.name}"? Esta
              ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SendProgressDialog
        isOpen={showSendProgress}
        onClose={() => setShowSendProgress(false)}
        isComplete={sendProgressComplete}
        numContacts={contactList.length}
        templateName={template?.name || "Template"}
      />

      <LeadsSelectorDialog
        isOpen={showLeadsSelector}
        onClose={() => setShowLeadsSelector(false)}
        onConfirm={handleLeadsSelection}
      />
    </div>
  );
}
