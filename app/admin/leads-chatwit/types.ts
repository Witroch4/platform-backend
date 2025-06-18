export interface ArquivoLeadChatwit {
  id: string;
  fileType: string;
  dataUrl: string;
  pdfConvertido?: string | null;
  createdAt: string;
}

export interface LeadChatwit {
  id: string;
  sourceId: string;
  name?: string;
  nomeReal?: string;
  phoneNumber?: string;
  email?: string;
  thumbnail?: string;
  concluido?: boolean;
  anotacoes?: string;
  pdfUnificado?: string;
  imagensConvertidas?: string;
  leadUrl?: string;
  fezRecurso?: boolean;
  datasRecurso?: string;
  provaManuscrita?: any;
  manuscritoProcessado?: boolean;
  aguardandoManuscrito?: boolean;
  espelhoCorrecao?: string;
  textoDOEspelho?: any;
  analiseUrl?: string;
  analiseProcessada?: boolean;
  aguardandoAnalise?: boolean;
  analisePreliminar?: any;
  analiseValidada?: boolean;
  consultoriaFase2?: boolean;
  seccional?: string;
  areaJuridica?: string;
  notaFinal?: number;
  situacao?: string;
  inscricao?: string;
  examesParticipados?: any;
  createdAt: string | Date;
  updatedAt: string | Date;
  usuario: {
    id: string;
    name: string;
    email: string;
    channel: string;
  };
  arquivos: Array<{
    id: string;
    dataUrl: string;
    fileType: string;
    pdfConvertido?: string | null;
    createdAt: string;
  }>;
  [key: string]: any;
}

// Tipo estendido para uso no processamento em lote
export interface ExtendedLead extends LeadChatwit {
  nome: string;  // Alias para name/nomeReal
  manuscrito?: string;  // Texto do manuscrito
} 