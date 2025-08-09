import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnhancedTextArea } from "@/app/admin/mtf-diamante/components/EnhancedTextArea";
import MetaMediaUpload, { type MetaMediaFile } from "@/components/custom/MetaMediaUpload";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import React, { useState, useEffect } from "react";

interface HeaderEditorProps {
  headerType: string;
  headerText: string;
  headerExample: string;
  headerMetaMedia: any[];
  onStateChange: (field: string, value: any) => void;
  variaveis: any[];
  loadingVariaveis: boolean;
}

export const HeaderEditor = ({ 
  headerType, headerText, headerExample, headerMetaMedia, 
  onStateChange, variaveis, loadingVariaveis 
}: HeaderEditorProps) => {

  const handleHeaderTypeChange = (value: any) => {
    if (value !== headerType) {
      onStateChange('headerMetaMedia', []);
    }
    onStateChange('headerType', value);
  }

  const ensureArray = (val: unknown): MetaMediaFile[] => Array.isArray(val) ? (val as MetaMediaFile[]) : [];

  const arraysEqualShallow = (a: MetaMediaFile[], b: MetaMediaFile[]) => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i]?.id !== b[i]?.id || a[i]?.status !== b[i]?.status || a[i]?.mediaHandle !== b[i]?.mediaHandle || a[i]?.url !== b[i]?.url) {
        return false;
      }
    }
    return true;
  };

  // Estado local para preservar as atualizações funcionais do MetaMediaUpload
  const [localFiles, setLocalFiles] = useState<MetaMediaFile[]>(ensureArray(headerMetaMedia));

  // Quando o pai mudar (ex.: reset), sincronizar local se houver diferença
  useEffect(() => {
    const incoming = ensureArray(headerMetaMedia);
    if (!arraysEqualShallow(localFiles, incoming)) {
      setLocalFiles(incoming);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerMetaMedia]);

  // Propagar alterações locais para o pai apenas quando houver diferença
  useEffect(() => {
    const parent = ensureArray(headerMetaMedia);
    if (!arraysEqualShallow(localFiles, parent)) {
      onStateChange('headerMetaMedia', localFiles as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localFiles]);

  return (
    <div>
      <h3 className="text-sm font-medium mb-2">Cabeçalho (Opcional)</h3>
      <Select value={headerType} onValueChange={handleHeaderTypeChange}>
        <SelectTrigger><SelectValue placeholder="Tipo de cabeçalho" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="NONE">Sem cabeçalho</SelectItem>
          <SelectItem value="TEXT">Texto</SelectItem>
          <SelectItem value="IMAGE">Imagem</SelectItem>
          <SelectItem value="DOCUMENT">Documento</SelectItem>
          <SelectItem value="VIDEO">Vídeo</SelectItem>
        </SelectContent>
      </Select>

      {headerType === 'TEXT' && (
        <div className="mt-2">
          <EnhancedTextArea
            value={headerText}
            onChange={(value) => onStateChange('headerText', value)}
            variables={variaveis}
            placeholder="Texto do cabeçalho"
            maxLength={60}
            label="Texto do cabeçalho"
            disabled={loadingVariaveis}
          />
          {/* Lógica de exemplo para o cabeçalho */}
        </div>
      )}

      {headerType === 'IMAGE' && (
        <div className="mt-4">
          <Label>Imagem do Cabeçalho</Label>
          <MetaMediaUpload
            uploadedFiles={localFiles}
            setUploadedFiles={setLocalFiles}
            allowedTypes={["image/jpeg", "image/png"]}
            maxSizeMB={5}
            maxFiles={1}
            onUploadComplete={(handle, file) => { /* ... */ }}
          />
          {localFiles.length === 0 && <Alert variant="destructive" className="mt-2"><AlertCircle className="h-4 w-4" /><AlertTitle>Imagem obrigatória</AlertTitle></Alert>}
        </div>
      )}
       {/* Lógica para VIDEO e DOCUMENT */}
    </div>
  );
};
