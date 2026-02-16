"use client";

import MapeamentoTab from "@/app/admin/mtf-diamante/components/MapeamentoTab";
import { useParams } from "next/navigation";

export default function InboxMapeamentoPage() {
	const params = useParams() as { id?: string };
	const caixaId = params?.id ?? "";
	if (!caixaId) return null;
	return <MapeamentoTab caixaId={caixaId} />;
}
