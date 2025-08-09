import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { WhatsAppTextEditor } from "@/app/admin/mtf-diamante/components/shared/WhatsAppTextEditor";
import { ButtonEditor } from "./ButtonEditor";
import { HeaderEditor } from "./HeaderEditor";
import { useMtfData } from "@/app/admin/mtf-diamante/context/MtfDataProvider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ContentEditorProps {
  formState: any; // Idealmente, use um tipo mais específico
  onStateChange: (field: string, value: any) => void;
  onButtonChange: (buttons: any[]) => void;
}

export const TemplateContentEditor = ({ formState, onStateChange, onButtonChange }: ContentEditorProps) => {
  const { variaveis, loadingVariaveis } = useMtfData();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conteúdo do Template</CardTitle>
        <CardDescription>Defina o conteúdo e a estrutura do template.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <HeaderEditor 
          headerType={formState.headerType}
          headerText={formState.headerText}
          headerExample={formState.headerExample}
          headerMetaMedia={formState.headerMetaMedia}
          onStateChange={onStateChange}
          variaveis={variaveis}
          loadingVariaveis={loadingVariaveis}
        />

        <div>
          <label className="text-sm font-medium">Corpo <span className="text-red-500">*</span></label>
          <p className="text-xs text-muted-foreground mb-2">Texto principal. Use placeholders nomeados: {'{{nome}}'}.</p>
          <WhatsAppTextEditor
            inline
            showPreview={false}
            initialText={formState.bodyText}
            onSave={(text) => onStateChange('bodyText', text)}
            onChange={(text) => onStateChange('bodyText', text)}
            placeholder="Texto principal da mensagem"
            maxLength={1024}
            variables={loadingVariaveis ? [] : variaveis}
            accountId="mtf-diamante"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Rodapé (Opcional)</label>
          <p className="text-xs text-muted-foreground mb-2">Texto adicional no final da mensagem.</p>
          <Input
            value={formState.footerText}
            onChange={(e) => onStateChange('footerText', e.target.value)}
            placeholder="Texto do rodapé..."
            maxLength={60}
            disabled={loadingVariaveis}
          />
          <div className="flex justify-between items-center text-xs mt-1">
            <div className="text-muted-foreground">Normalmente usado para avisos ou informações adicionais</div>
            <Badge
              variant={formState.footerText.length > 60 * 0.8 ? 'destructive' : 'outline'}
            >
              {formState.footerText.length}/60
            </Badge>
          </div>
        </div>

        <ButtonEditor buttons={formState.buttons} setButtons={onButtonChange} />
      </CardContent>
    </Card>
  );
};
