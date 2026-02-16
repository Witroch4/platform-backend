// app/(checkout)/payment-confirmation/layout.tsx
import type React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function PaymentConfirmationLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
			<header className="mb-8">
				{/* Exibe sua logo; ajuste os valores de width e height conforme necessário */}
				<Image src="/ChatWit.svg" alt="ChatWit Logo" width={150} height={50} />
			</header>
			<main className="w-full max-w-md bg-white p-6 rounded-lg shadow">{children}</main>
		</div>
	);
}
