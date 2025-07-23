// app/admin/templates/[id]/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
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
  CardFooter,
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
  Send,
  Trash2,
  Edit,
  CheckCircle,
  Copy,
  Clipboard,
  Phone,
  ExternalLink,
  Users,
  FileUp,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SendProgressDialog } from "../components/send-progress-dialog";
import { LeadsSelectorDialog } from "../components/leads-selector-dialog";

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
  templateId?: string;
  onBack?: () => void;
}

export default function TemplateDetailsPage({
  templateId: propTemplateId,
  onBack,
}: TemplateDetailsPageProps = {}) {
  const router = useRouter();
  // Para navegação interna, sempre usar o templateId passado via props
  const actualTemplateId = propTemplateId;

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
  const [isMassUploading, setIsMassUploading] = useState(false);
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
      if (!actualTemplateId) {
        setError("ID do template não fornecido");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        console.log("Buscando template com ID:", actualTemplateId);

        const res = await axios
          .get(
            `/api/admin/mtf-diamante/template-info?template=${actualTemplateId}`
          )
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
          id: actualTemplateId!,
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
  }, [actualTemplateId]);

  function getCategoryColor(c: string) {
    switch (c.toUpperCase()) {
      case "UTILITY":
        return "bg-blue-100 text-blue-800";
      case "MARKETING":
        return "bg-amber-100 text-amber-800";
      case "AUTHENTICATION":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  }

  function getStatusColor(s: string) {
    switch (s.toUpperCase()) {
      case "APPROVED":
        return "bg-green-100 text-green-800";
      case "REJECTED":
        return "bg-red-100 text-red-800";
      case "PENDING":
        return "bg-yellow-100 text-yellow-800";
      case "PAUSED":
        return "bg-orange-100 text-orange-800";
      case "DISABLED":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  }

  // Format phone number for display
  const formatPhoneNumber = (phone: string) => {
    if (!phone) return "";
    // Basic formatting for Brazil numbers
    if (phone.startsWith("+55") || phone.startsWith("55")) {
      const cleaned = phone.replace(/\D/g, "");
      if (cleaned.length === 12 || cleaned.length === 13) {
        // With or without country code
        return phone.startsWith("+") ? phone : `+${phone}`;
      }
    }
    return phone;
  };

  const handleTestSend = async () => {
    if (!template) return;
    setIsSending(true);
    try {
      let phone = testPhoneNumber.replace(/\D/g, "");
      if (!phone.startsWith("55")) phone = "55" + phone;

      // paylod
      const payload = {
        templateId: template.id,
        selectedLeads: [phone], // Para teste individual, um único número
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
    setShowDeleteDialog(false); // Fechar o diálogo

    try {
      const res = await axios.delete("/api/admin/mtf-diamante/templates", {
        data: { name: template.name },
      });
      if (res.data.success) {
        toast.success("Template excluído");
        if (onBack) {
          onBack();
        } else {
          router.push("/admin/mtf-diamante");
        }
      } else {
        toast.error(res.data.error);
      }
    } catch {
      toast.error("Erro ao excluir template");
    } finally {
      setIsDeleting(false);
    }
  };

  // Dentro do componente da página, adicione esta função para exibir a origem da mídia
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
      // Extrair apenas os números dos contatos
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
    // Converter leads do sistema para o formato de contatos
    const contacts = selectedLeads
      .map((lead) => ({
        nome: lead.nomeReal || lead.name || "Lead sem nome",
        numero: lead.phoneNumber || "",
      }))
      .filter((contact) => contact.numero); // Filtrar apenas com número válido

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
        {onBack ? (
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft />
          </Button>
        ) : (
          <Link href="/admin/mtf-diamante">
            <Button variant="ghost" size="icon">
              <ArrowLeft />
            </Button>
          </Link>
        )}
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
                                {c.format === "DOCUMENT" && (
                                  <div className="w-full bg-gray-100 rounded-md mb-2 p-3 flex items-center justify-center">
                                    <svg
                                      className="w-8 h-8 text-gray-500 mr-2"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                      ></path>
                                    </svg>
                                    <span className="text-sm font-medium">
                                      Documento
                                    </span>
                                  </div>
                                )}
                                {c.format === "VIDEO" && (
                                  <div
                                    className="w-full bg-gray-100 rounded-md mb-2 flex items-center justify-center"
                                    style={{ maxHeight: "180px" }}
                                  >
                                    {headerMedia ? (
                                      <div className="flex flex-col items-center justify-center w-full h-full">
                                        {headerMedia.includes("http") ? (
                                          <video
                                            src={headerMedia}
                                            controls
                                            className="w-full rounded-md max-h-[160px] object-contain"
                                          />
                                        ) : (
                                          <>
                                            <CheckCircle className="w-8 h-8 text-green-500 mb-2" />
                                            <p className="text-sm font-medium text-green-600">
                                              Vídeo processado
                                            </p>
                                            <p className="text-xs text-gray-500 mt-1">
                                              Media Handle:{" "}
                                              {headerMedia.substring(0, 10)}...
                                            </p>
                                          </>
                                        )}
                                      </div>
                                    ) : (
                                      <svg
                                        className="w-12 h-12 text-gray-500"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        xmlns="http://www.w3.org/2000/svg"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth="2"
                                          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                                        ></path>
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth="2"
                                          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                        ></path>
                                      </svg>
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
                    disabled={isSending}
                    className="mt-4"
                  >
                    {isSending ? (
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Enviar teste
                  </Button>
                </TabsContent>

                <TabsContent value="massa" className="space-y-4">
                  <div className="space-y-4">
                    {/* Opção principal: Selecionar leads do sistema */}
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">
                        Lista de Contatos
                      </Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Users className="h-5 w-5 text-primary" />
                              <h3 className="font-medium">
                                Selecionar da Base
                              </h3>
                            </div>
                            <Badge variant="default" className="text-xs">
                              Recomendado
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            Selecione leads diretamente da base de dados do
                            sistema
                          </p>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => setShowLeadsSelector(true)}
                            className="w-full"
                          >
                            <Users className="h-4 w-4 mr-2" />
                            Selecionar Leads
                          </Button>
                        </div>

                        <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-2 mb-3">
                            <FileUp className="h-5 w-5 text-muted-foreground" />
                            <h3 className="font-medium">Upload de Arquivo</h3>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            Faça upload de um arquivo CSV com contatos externos
                          </p>
                          <Input
                            type="file"
                            accept=".csv"
                            disabled={isMassUploading}
                            className="h-8"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                  const csvData = event.target
                                    ?.result as string;
                                  try {
                                    const lines = csvData
                                      .split(/\r?\n/)
                                      .filter((line) => line.trim());
                                    const dataLines =
                                      lines[0].toLowerCase().includes("nome") &&
                                      lines[0].toLowerCase().includes("numero")
                                        ? lines.slice(1)
                                        : lines;

                                    const contacts = dataLines
                                      .map((line) => {
                                        const [nome, numero] = line
                                          .split(",")
                                          .map((item) => item.trim());
                                        return { nome, numero };
                                      })
                                      .filter(
                                        (contact) =>
                                          contact.nome && contact.numero
                                      );

                                    setContactList(contacts);
                                    toast.success(
                                      `${contacts.length} contatos carregados com sucesso`
                                    );
                                  } catch (error) {
                                    console.error(
                                      "Erro ao processar o arquivo CSV:",
                                      error
                                    );
                                    toast.error(
                                      "Erro ao processar o arquivo. Verifique o formato."
                                    );
                                  }
                                };
                                reader.readAsText(file);
                              }
                            }}
                          />
                          <p className="mt-2 text-xs text-muted-foreground">
                            Formato: "Nome,Numero" (uma entrada por linha)
                          </p>
                        </div>
                      </div>
                    </div>

                    {contactList.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>
                            Contatos carregados: {contactList.length}
                          </Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setContactList([])}
                          >
                            Limpar
                          </Button>
                        </div>
                        <div className="border rounded-md overflow-hidden">
                          <div className="max-h-40 overflow-y-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Nome
                                  </th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Número
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {contactList.slice(0, 5).map((contact, idx) => (
                                  <tr key={idx}>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                                      {contact.nome}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                                      {contact.numero}
                                    </td>
                                  </tr>
                                ))}
                                {contactList.length > 5 && (
                                  <tr>
                                    <td
                                      colSpan={2}
                                      className="px-3 py-2 text-center text-sm text-gray-500"
                                    >
                                      ...e mais {contactList.length - 5}{" "}
                                      contatos
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                    {template.componentes.some((c) =>
                      Array.isArray(c.parameters)
                    ) && (
                      <div>
                        <p className="font-medium mb-2">
                          Variáveis (aplicadas a todos os contatos)
                        </p>
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
                                    setHeaderMedia(
                                      template.publicMediaUrl || ""
                                    )
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
                      onClick={handleMassSend}
                      disabled={
                        isMassUploading ||
                        isMassSending ||
                        contactList.length === 0
                      }
                      className="mt-4"
                    >
                      {isMassSending ? (
                        <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Enviar para {contactList.length} contatos
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Informações do template */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Informações</CardTitle>
              <CardDescription>Propriedades</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <code className="font-mono bg-muted px-2 py-1">
                  {template.name}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(template.name);
                    toast("Nome copiado");
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <code className="font-mono bg-muted px-2 py-1">
                  {template.id}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(template.id);
                    toast("ID copiado");
                  }}
                >
                  <Clipboard className="h-3 w-3" />
                </Button>
              </div>

              <Separator />

              <div>
                <p className="font-medium">Status</p>
                <Badge className={getStatusColor(template.status)}>
                  {template.status}
                </Badge>
              </div>
              <div>
                <p className="font-medium">Categoria</p>
                <Badge className={getCategoryColor(template.category)}>
                  {template.category}
                </Badge>
              </div>
              <div>
                <p className="font-medium">Idioma</p>
                <p>{template.language}</p>
              </div>
              {template.subCategory && (
                <div>
                  <p className="font-medium">Subcategoria</p>
                  <p>{template.subCategory}</p>
                </div>
              )}

              <Separator />

              {template.qualityScore && (
                <div>
                  <p className="font-medium">Qualidade</p>
                  <Badge
                    className={
                      template.qualityScore === "GREEN"
                        ? "bg-green-100 text-green-800"
                        : template.qualityScore === "YELLOW"
                          ? "bg-yellow-100 text-yellow-800"
                          : template.qualityScore === "RED"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-800"
                    }
                  >
                    {template.qualityScore}
                  </Badge>
                </div>
              )}
              {template.previousCategory && (
                <div>
                  <p className="font-medium">Categoria Anterior</p>
                  <p>{template.previousCategory}</p>
                </div>
              )}
              {template.parameterFormat && (
                <div>
                  <p className="font-medium">Formato Parâmetros</p>
                  <p>{template.parameterFormat}</p>
                </div>
              )}
              {template.lastEdited && (
                <div>
                  <p className="font-medium">Última Edição</p>
                  <p>
                    {new Date(template.lastEdited).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              )}

              <Separator />

              <Alert>
                <CheckCircle />
                <AlertTitle>Dicas</AlertTitle>
                <AlertDescription className="text-xs">
                  • Verifique sempre o número.
                  <br />
                  • Não envie dados sensíveis nas variáveis.
                  <br />• Use "Disparo em Massa" para vários contatos.
                </AlertDescription>
              </Alert>

              {template.status === "REJECTED" && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>Rejeitado</AlertTitle>
                  <AlertDescription className="text-xs">
                    Revise as políticas do WhatsApp e corrija.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(template.id);
                  toast("ID copiado");
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copiar código
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* Diálogo de progresso de envio */}
      <SendProgressDialog
        isOpen={showSendProgress}
        onClose={() => setShowSendProgress(false)}
        numContacts={contactList.length}
        templateName={template?.name || ""}
        isComplete={sendProgressComplete}
        onComplete={() => {
          setSendProgressComplete(false);
          setShowSendProgress(false);
        }}
      />

      {/* Diálogo de seleção de leads */}
      <LeadsSelectorDialog
        isOpen={showLeadsSelector}
        onClose={() => setShowLeadsSelector(false)}
        onConfirm={handleLeadsSelection}
        title="Selecionar Leads para Campanha"
        description={`Selecione os leads que receberão o template "${template?.name}"`}
      />

      {/* Diálogo de confirmação de exclusão */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-3">
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Excluir Template
            </DialogTitle>
            <DialogDescription className="text-base">
              Tem certeza de que deseja excluir o template{" "}
              <span className="font-medium">"{template?.name}"</span>?
            </DialogDescription>
            <p className="text-sm text-muted-foreground">
              Esta ação não pode ser desfeita.
            </p>
          </DialogHeader>
          <DialogFooter className="mt-4 sm:justify-end sm:space-x-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
