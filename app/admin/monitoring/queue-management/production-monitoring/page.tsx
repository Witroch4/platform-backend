/**
 * Página de Monitoramento de Produção
 * Dashboard para alertas de infraestrutura, saúde das conexões e disaster recovery
 */

import { Metadata } from "next";
import ProductionMonitoringDashboard from "../components/ProductionMonitoringDashboard";

export const metadata: Metadata = {
	title: "Monitoramento de Produção | Queue Management",
	description: "Monitoramento de infraestrutura, alertas e disaster recovery para filas BullMQ",
};

export default function ProductionMonitoringPage() {
	return <ProductionMonitoringDashboard />;
}
