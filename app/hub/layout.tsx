import type React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Hub — Socialwise",
	description: "Escolha sua área de trabalho",
};

export default function HubLayout({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}
