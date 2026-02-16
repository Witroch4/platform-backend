/**
 * SocialWise Flow Monitoring Dashboard Page
 * Admin interface for real-time performance monitoring
 */

import { Metadata } from "next";
import { SocialWiseFlowMonitoringDashboard } from "@/components/admin/socialwise-flow-monitoring-dashboard";

export const metadata: Metadata = {
	title: "SocialWise Flow - Monitoramento | Chatwit Admin",
	description: "Dashboard de monitoramento em tempo real do SocialWise Flow",
};

export default function SocialWiseFlowMonitoringPage() {
	return (
		<div className="container mx-auto py-6">
			<SocialWiseFlowMonitoringDashboard />
		</div>
	);
}
