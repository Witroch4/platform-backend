import { LeadChatwit } from "../../../types";

export interface LeadItemProps {
  lead: LeadChatwit;
  isSelected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (lead: LeadChatwit) => void;
  onUnificar: (id: string) => void;
  onConverter: (id: string) => void;
  onDigitarManuscrito: (lead: LeadChatwit) => void;
  onRefresh?: () => void;
  isUnifying: boolean;
  isConverting: string | null;
  espelhosPadrao?: any[];
  loadingEspelhosPadrao?: boolean;
}

export interface CellProps {
  lead: LeadChatwit;
  onEdit: (lead: LeadChatwit) => void;
}

export interface SelectCellProps {
  isSelected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  leadId: string;
}

export interface FileCellProps extends CellProps {
  onDelete: (id: string) => void;
}

export interface PdfCellProps extends CellProps {
  onUnificar: (id: string) => void;
  isUnifying: boolean;
}

export interface ImagesCellProps extends CellProps {
  onConverter: (id: string) => void;
  isConverting: string | null;
}

export interface ManuscritoCellProps extends CellProps {
  onDigitarManuscrito: (lead: LeadChatwit) => void;
}



export type ProcessType = "unify" | "convert";

export interface ContextAction {
  type: string;
  data?: any;
} 