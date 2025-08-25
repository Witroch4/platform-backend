import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface BasicInfoProps {
  name: string;
  language: string;
  allowCategoryChange: boolean;
  onNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLanguageChange: (value: string) => void;
  onAllowCategoryChange: (value: boolean) => void;
  isValidName: boolean;
}

export const TemplateBasicInfo = ({ 
  name, language, allowCategoryChange, 
  onNameChange, onLanguageChange, onAllowCategoryChange, 
  isValidName 
}: BasicInfoProps) => (
  <Card>
    <CardHeader>
      <CardTitle>Informações Básicas</CardTitle>
      <CardDescription>Defina as propriedades principais do template.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      <div>
        <Label htmlFor="template-name">Nome do Template <span className="text-red-500">*</span></Label>
        <Input
          id="template-name"
          placeholder="nome_do_template"
          value={name}
          onChange={onNameChange}
          className={!isValidName && name ? "border-red-500" : ""}
        />
        <p className="text-xs text-muted-foreground mt-1.5">Use apenas letras minúsculas, números e underscores (_).</p>
        {!isValidName && name && <p className="text-xs text-red-500 mt-1.5">Nome inválido.</p>}
      </div>
      <div>
        <Label htmlFor="language">Idioma <span className="text-red-500">*</span></Label>
        <Select value={language} onValueChange={onLanguageChange}>
          <SelectTrigger><SelectValue placeholder="Selecione o idioma" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pt_BR">Português (Brasil)</SelectItem>
            <SelectItem value="en_US">Inglês (EUA)</SelectItem>
            <SelectItem value="es_ES">Espanhol (Espanha)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center space-x-2 pt-1">
        <Checkbox id="allow-category-change" checked={allowCategoryChange} onCheckedChange={(checked) => onAllowCategoryChange(!!checked)} />
        <Label htmlFor="allow-category-change">Permitir que o WhatsApp altere a categoria.</Label>
      </div>
    </CardContent>
  </Card>
);
