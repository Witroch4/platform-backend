import { Toaster } from "sonner";

export default function ContasLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="min-h-screen bg-background">
			<main className="container mx-auto py-4">{children}</main>
			<Toaster position="top-right" />
		</div>
	);
}
