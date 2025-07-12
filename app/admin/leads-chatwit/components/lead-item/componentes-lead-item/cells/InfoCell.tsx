import { TableCell } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone } from "lucide-react";
import { CellProps } from "../types";
import { getDisplayName, formatDate } from "../utils";

interface InfoCellProps extends CellProps {
  onViewDetails: () => void;
  onShowFullImage: () => void;
}

export function InfoCell({ lead, onViewDetails, onShowFullImage }: InfoCellProps) {
  const displayName = getDisplayName(lead);
  const formattedDate = formatDate(lead.createdAt ?? new Date());

  return (
    <TableCell className="min-w-[200px] max-w-[280px] p-1 align-middle sticky left-[40px] bg-card z-10 overflow-hidden">
      <div className="flex items-center gap-2">
        <Avatar className="h-9 w-9 cursor-pointer" onClick={onShowFullImage}>
          {lead.thumbnail ? (
            <AvatarImage src={lead.thumbnail} alt={displayName} />
          ) : null}
          <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div 
            className="font-medium hover:text-primary hover:underline cursor-pointer truncate" 
            onClick={onViewDetails}
            title={lead.name || "Lead sem nome"}
          >
            {lead.name || "Lead sem nome"}
          </div>
          {lead.nomeReal && lead.nomeReal !== lead.name && (
            <div className="text-xs text-muted-foreground truncate" title={lead.nomeReal}>
               {lead.nomeReal}
            </div>
          )}
          <div className="mt-1">
            {lead.phoneNumber && (
              <p className="text-sm truncate">
                <Phone className="inline-block h-3 w-3 mr-1" />
                {lead.phoneNumber}
              </p>
            )}
            <p className="text-sm truncate">{formattedDate}</p>
          </div>
        </div>
      </div>
    </TableCell>
  );
} 