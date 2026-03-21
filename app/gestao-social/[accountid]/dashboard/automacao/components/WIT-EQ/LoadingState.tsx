// app/dashboard/automação/components/LoadingState.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingState() {
	return (
		<div style={{ padding: "2rem 1rem", maxWidth: "600px", margin: "0 auto", textAlign: "left" }}>
			<Skeleton className="h-[125px] w-[250px] rounded-xl mb-6" />
			<Skeleton className="h-4 w-[150px] mb-2" />
			<Skeleton className="h-4 w-[100px] mb-6" />
			<div className="space-y-4">
				<Skeleton className="h-[125px] w-[250px] rounded-xl" />
				<Skeleton className="h-[125px] w-[250px] rounded-xl" />
			</div>
		</div>
	);
}
