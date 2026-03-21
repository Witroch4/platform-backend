import { TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { CellProps } from "../types";

export function UserCell({ lead }: CellProps) {
	return (
		<TableCell className="min-w-[80px] max-w-[120px] p-2 align-middle">
			<div className="flex flex-col">
				<div className="font-medium">{lead.usuarioChatwit?.name || "N/A"}</div>
				<Badge variant="outline" className="w-fit">
					{lead.usuarioChatwit?.channel || "N/A"}
				</Badge>
			</div>
		</TableCell>
	);
}
