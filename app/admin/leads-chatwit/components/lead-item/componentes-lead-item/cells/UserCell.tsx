import { TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CellProps } from "../types";

export function UserCell({ lead }: CellProps) {
  return (
    <TableCell className="min-w-[80px] max-w-[120px] p-2 align-middle">
      <div className="flex flex-col">
        <div className="font-medium">{lead.usuario.name}</div>
        <Badge variant="outline" className="w-fit">
          {lead.usuario.channel}
        </Badge>
      </div>
    </TableCell>
  );
} 