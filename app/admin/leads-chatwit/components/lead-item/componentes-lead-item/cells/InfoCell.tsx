import { TableCell } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Phone, CircleDollarSign } from "lucide-react";
import type { CellProps } from "../types";
import { getDisplayName, formatDate, isNewLead } from "../utils";
import { NewLeadIndicator } from "./NewLeadIndicator";

interface InfoCellProps extends CellProps {
	onViewDetails: () => void;
	onShowFullImage: () => void;
}

export function InfoCell({ lead, onViewDetails, onShowFullImage }: InfoCellProps) {
	const displayName = getDisplayName(lead);
	const formattedDate = formatDate(lead.createdAt ?? new Date());
	const isNew = isNewLead(lead.createdAt ?? new Date());
	const hasPayments = (lead.payments?.length ?? 0) > 0;
	const lastThreePayments = hasPayments
		? lead.payments!.filter(p => (p.paidAmountCents ?? p.amountCents) > 0).slice(-3).reverse()
		: [];
	const totalPaidCents = hasPayments
		? lead.payments!.reduce((sum, p) => sum + (p.paidAmountCents ?? p.amountCents), 0)
		: 0;
	const paymentMethod = hasPayments ? (lead.payments![0].captureMethod ?? null) : null;
	const methodLabel =
		paymentMethod === "pix"
			? "Pix"
			: paymentMethod === "credit_card"
				? "Crédito"
				: paymentMethod === "debit_card"
					? "Débito"
					: paymentMethod === "boleto"
						? "Boleto"
						: null;
	const methodBadgeClass =
		paymentMethod === "pix"
			? "bg-blue-600 hover:bg-blue-700"
			: paymentMethod === "credit_card" || paymentMethod === "debit_card"
				? "bg-violet-600 hover:bg-violet-700"
				: "bg-slate-600 hover:bg-slate-700";

	return (
		<TableCell className="min-w-[200px] max-w-[280px] p-1 align-middle sticky left-[40px] bg-card z-10 overflow-hidden">
			<div className="flex items-center gap-2">
				<Avatar className="h-9 w-9 cursor-pointer" onClick={onShowFullImage}>
					{lead.thumbnail ? <AvatarImage src={lead.thumbnail} alt={displayName} /> : null}
					<AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
				</Avatar>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-1">
						<div
							className="font-medium hover:text-primary hover:underline cursor-pointer truncate"
							onClick={onViewDetails}
							title={lead.name || "Lead sem nome"}
						>
							{lead.name || "Lead sem nome"}
						</div>
						<NewLeadIndicator isNew={isNew} />
					</div>
					{lastThreePayments.length > 0 && (
						<div className="flex items-center gap-0.5 mt-0.5 flex-wrap cursor-pointer" onClick={onViewDetails} title="Ver todos os pagamentos">
							{lastThreePayments.map((p) => (
								<Badge
									key={p.id}
									variant="default"
									className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] px-1 py-0 h-4 flex-shrink-0"
									title={`Pagamento: R$ ${((p.paidAmountCents ?? p.amountCents) / 100).toFixed(2).replace(".", ",")}`}
								>
									<CircleDollarSign className="h-2.5 w-2.5 mr-0.5" />
									{((p.paidAmountCents ?? p.amountCents) / 100).toFixed(0)}
								</Badge>
							))}
							{methodLabel && (
								<Badge
									variant="default"
									className={`${methodBadgeClass} text-white text-[10px] px-1 py-0 h-4 flex-shrink-0`}
								>
									{methodLabel}
								</Badge>
							)}
						</div>
					)}
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
