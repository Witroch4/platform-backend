import { TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import type { SelectCellProps } from "../types";

export function SelectCell({ isSelected, onSelect, leadId }: SelectCellProps) {
  return (
    <TableCell className="min-w-[40px] w-[40px] p-1 align-middle sticky left-0 bg-card z-20">
      <Checkbox 
        checked={isSelected} 
        onCheckedChange={(checked) => onSelect(leadId, checked as boolean)}
        aria-label="Selecionar lead"
      />
    </TableCell>
  );
} 