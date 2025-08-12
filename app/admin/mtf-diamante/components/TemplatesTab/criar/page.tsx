"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Send, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useTemplateForm, TemplateFormState } from "@/hooks/useTemplateForm";
import { TemplateCategorySelector } from "./components/TemplateCategorySelector";
import { TemplateBasicInfo } from "./components/TemplateBasicInfo";
import { TemplateContentEditor } from "./components/TemplateContentEditor";
import { TemplatePreview } from "./components/TemplatePreview";
import { Stepper } from "@/components/custom"; // Stepper barrel export
import { InteractivePreview } from "@/app/admin/mtf-diamante/components/shared/InteractivePreview";
import { resolveInteractiveMessagePreview } from "@/lib/whatsapp/variables-shared";
import { extractVariables } from "@/lib/whatsapp/variable-utils";
import type { InteractiveMessage, QuickReplyButton } from "@/types/interactive-messages";

const initialFormState: TemplateFormState = {
  name: "",
  category: "MARKETING",
  language: "pt_BR",
  allowCategoryChange: false,
  headerType: "NONE",
  headerText: "",
  headerExample: "",
  headerNamedExamples: {},
  headerMetaMedia: [],
  bodyText: "",
  bodyExamples: [],
  footerText: "",
  buttons: [],
};

export default function CreateTemplatePage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const {
    state,
    isSubmitting,
    error,
    creationSuccess,
    templateId,
    isValidName,
    isFormValid,
    handleStateChange,
    handleNameChange,
    addButton,
    removeButton,
    updateButton,
    onDragEndButtons,
    createTemplate,
  } = useTemplateForm(initialFormState);

  const steps = ["Configurar", "Editar", "Analisar"];

  // Prévia consolidada para a etapa 3
  const reviewPreviewMessage = useMemo(() => {
    const buildVariablesMap = (): Record<string, string> => {
      const map: Record<string, string> = {};
      // Header variables
      const headerVars = extractVariables(state.headerText).map((v) => v.replace(/\{|\}/g, ""));
      if (state.headerNamedExamples && Object.keys(state.headerNamedExamples).length > 0) {
        for (const k of headerVars) {
          if (state.headerNamedExamples[k]) map[k] = state.headerNamedExamples[k];
        }
      } else if (headerVars.length > 0 && state.headerExample) {
        headerVars.forEach((k) => (map[k] = state.headerExample));
      }
      // Body variables
      const bodyVars = extractVariables(state.bodyText).map((v) => v.replace(/\{|\}/g, ""));
      if (state.bodyNamedExamples && Object.keys(state.bodyNamedExamples).length > 0) {
        for (const k of bodyVars) {
          if (state.bodyNamedExamples[k]) map[k] = state.bodyNamedExamples[k];
        }
      } else {
        bodyVars.forEach((k, i) => {
          const ex = state.bodyExamples?.[i];
          if (ex) map[k] = ex;
        });
      }
      if (!map["nome_lead"]) map["nome_lead"] = "João";
      return map;
    };

    const buildPreviewMessage = (): InteractiveMessage => {
      const headerType = state.headerType;
      const mediaFile = Array.isArray(state.headerMetaMedia) && state.headerMetaMedia.length > 0 ? state.headerMetaMedia[0] : null;

      const header = (() => {
        if (headerType === "TEXT" && state.headerText) {
          return { type: "text", content: state.headerText } as const;
        }
        if (headerType === "IMAGE" && mediaFile?.url) {
          return { type: "image", content: "", mediaUrl: mediaFile.url } as const;
        }
        if (headerType === "VIDEO" && mediaFile?.url) {
          return { type: "video", content: "", mediaUrl: mediaFile.url } as const;
        }
        if (headerType === "DOCUMENT" && mediaFile?.url) {
          return { type: "document", content: mediaFile.file?.name || "Documento", mediaUrl: mediaFile.url, filename: mediaFile.file?.name } as const;
        }
        return undefined;
      })();

      const body = { text: state.bodyText || "" } as const;
      const footer = state.footerText ? { text: state.footerText } : undefined;

      const buttons: QuickReplyButton[] = Array.isArray(state.buttons)
        ? state.buttons.map((b: any, index: number) => ({
            id: b.id || `btn_${index}`,
            title: b.text || `Botão ${index + 1}`,
            type: "reply",
            reply: { id: b.id || `btn_${index}`, title: b.text || `Botão ${index + 1}` },
          }))
        : [];

      const action = buttons.length > 0 ? ({ type: "button", buttons } as const) : undefined;

      return {
        name: state.name || "preview-template",
        type: buttons.length > 0 ? "button" : "list",
        header: header as any,
        body: body as any,
        footer: footer as any,
        action: action as any,
        isActive: true,
      };
    };

    const vars = buildVariablesMap();
    const msg = buildPreviewMessage();
    return resolveInteractiveMessagePreview(msg as any, vars, { defaultLeadExampleName: "João" });
  }, [state]);

  return (
    <div className="container mx-auto py-10 max-w-6xl">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.push("/admin/mtf-diamante") }>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Criar Novo Template</h1>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Stepper steps={steps} currentStep={currentStep} className="mb-8" />

      {currentStep === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-6">
          <div className="md:col-span-5 space-y-6">
            <TemplateCategorySelector 
              selectedCategory={state.category}
              onSelectCategory={(cat) => handleStateChange('category', cat)}
              onCancel={() => router.push('/admin/mtf-diamante')}
            />
            <TemplateBasicInfo 
              name={state.name}
              language={state.language}
              allowCategoryChange={state.allowCategoryChange}
              onNameChange={handleNameChange}
              onLanguageChange={(lang) => handleStateChange('language', lang)}
              onAllowCategoryChange={(val) => handleStateChange('allowCategoryChange', val)}
              isValidName={isValidName}
            />
          </div>
          <div className="md:col-span-2">
            <TemplatePreview formState={state} />
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
                <TemplateContentEditor 
                    formState={state}
                    onStateChange={(field, value) => handleStateChange(field as keyof TemplateFormState, value as any)}
                    onButtonChange={(btns) => handleStateChange('buttons', btns)}
                />
            </div>
            <div className="md:col-span-1">
                <TemplatePreview formState={state} />
            </div>
        </div>
      )}

      {currentStep === 2 && (
         <div className="flex justify-center">
            <div className="w-full max-w-md">
              <InteractivePreview message={reviewPreviewMessage as any} debounceMs={150} />
            </div>
         </div>
      )}

      <div className="flex justify-between mt-8 relative z-50">
        <Button type="button" variant="outline" onClick={() => router.push("/admin/mtf-diamante") }>
          Cancelar
        </Button>
        {currentStep < 2 ? (
          <Button type="button" onClick={() => setCurrentStep(currentStep + 1)} disabled={currentStep === 0 ? !isValidName : false}>
            Avançar
          </Button>
        ) : (
          <Button type="button" onClick={createTemplate} disabled={isSubmitting || !isFormValid}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Enviar Template
          </Button>
        )}
      </div>

      {creationSuccess && templateId && (
        <div className="mt-6"> 
            {/* Mensagem de sucesso */}
        </div>
      )}
    </div>
  );
}