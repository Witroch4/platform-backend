// app/dashboard/automação/components/ErrorState.tsx

interface ErrorStateProps {
	error: string;
}

export default function ErrorState({ error }: ErrorStateProps) {
	return (
		<div style={{ padding: "2rem 1rem", maxWidth: "600px", margin: "0 auto", textAlign: "left" }}>
			<p style={{ color: "red" }}>{error}</p>
		</div>
	);
}
