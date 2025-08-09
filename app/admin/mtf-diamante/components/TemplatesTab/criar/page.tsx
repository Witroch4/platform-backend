"use client";

import { useState } from "react";
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

const initialFormState: TemplateFormState = {
  name: "",
  category: "MARKETING",
  language: "pt_BR",
  allowCategoryChange: false,
  headerType: "NONE",
  headerText: "",
  headerExample: "",
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

  return (
    <div className="container mx-auto py-10 max-w-6xl">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.push("/admin/mtf-diamante")}>
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
         <div>
            {/* Componente de revisão e submissão */}
         </div>
      )}

      <div className="flex justify-between mt-8 relative z-50">
        <Button type="button" variant="outline" onClick={() => currentStep > 0 ? setCurrentStep(currentStep - 1) : router.push("/admin/mtf-diamante")}>
          {currentStep === 0 ? "Cancelar" : "Voltar"}
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