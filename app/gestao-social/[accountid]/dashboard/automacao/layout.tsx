// app/[accountid]/dashboard/automacao/layout.tsx

import type React from "react";
import SubscriptionGuard from "@/components/subscription-guard";

export default function AutomacaoLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <SubscriptionGuard fallbackPath="/assine-agora">{children}</SubscriptionGuard>;
}
