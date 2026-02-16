"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TestTube, Send } from "lucide-react";

interface TestResult {
	intent?: {
		id: string;
		name: string;
		slug: string;
		actionType: string;
	};
	score: number;
	candidates: Array<{
		name: string;
		similarity: number;
		threshold: number;
	}>;
	classification: "MATCHED" | "NO_MATCH";
	processingTime: number;
}

export default function IntentTestingTool() {
	const [testText, setTestText] = useState("");
	const [accountId, setAccountId] = useState("");
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<TestResult | null>(null);
	const [error, setError] = useState("");

	const handleTest = async () => {
		if (!testText.trim()) {
			setError("Please enter text to test");
			return;
		}

		setLoading(true);
		setError("");
		setResult(null);

		try {
			const response = await fetch("/api/admin/ai-integration/intents/test", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					text: testText,
					accountId: accountId || undefined,
				}),
			});

			if (response.ok) {
				const data = await response.json();
				setResult(data);
			} else {
				const errorData = await response.json();
				setError(errorData.error || "Failed to test intent classification");
			}
		} catch (error) {
			console.error("Error testing intent:", error);
			setError("Error testing intent classification");
		} finally {
			setLoading(false);
		}
	};

	const getScoreColor = (score: number) => {
		if (score >= 0.8) return "text-green-600";
		if (score >= 0.6) return "text-yellow-600";
		return "text-red-600";
	};

	const getScoreBadge = (score: number, threshold: number) => {
		const isMatch = score >= threshold;
		return (
			<Badge variant={isMatch ? "default" : "secondary"}>
				{(score * 100).toFixed(1)}% {isMatch ? "✓" : "✗"}
			</Badge>
		);
	};

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<TestTube className="h-5 w-5" />
						Intent Classification Testing
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div>
						<Label htmlFor="testText">Test Message *</Label>
						<Textarea
							id="testText"
							value={testText}
							onChange={(e) => setTestText(e.target.value)}
							placeholder="Enter a message to test intent classification..."
							rows={3}
						/>
					</div>

					<div>
						<Label htmlFor="accountId">Account ID (optional)</Label>
						<Input
							id="accountId"
							value={accountId}
							onChange={(e) => setAccountId(e.target.value)}
							placeholder="Leave empty to test against all intents"
						/>
					</div>

					{error && (
						<div className="p-3 bg-red-50 border border-red-200 rounded-md">
							<p className="text-sm text-red-600">{error}</p>
						</div>
					)}

					<Button onClick={handleTest} disabled={loading || !testText.trim()} className="flex items-center gap-2">
						<Send className="h-4 w-4" />
						{loading ? "Testing..." : "Test Classification"}
					</Button>
				</CardContent>
			</Card>

			{result && (
				<Card>
					<CardHeader>
						<CardTitle>Test Results</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
							<div>
								<p className="font-medium">Classification Result</p>
								<p className="text-sm text-gray-600">Processing time: {result.processingTime}ms</p>
							</div>
							<Badge
								variant={result.classification === "MATCHED" ? "default" : "secondary"}
								className="text-lg px-3 py-1"
							>
								{result.classification}
							</Badge>
						</div>

						{result.intent && (
							<div className="p-4 bg-green-50 border border-green-200 rounded-lg">
								<h4 className="font-medium text-green-800 mb-2">Matched Intent</h4>
								<div className="space-y-2">
									<div className="flex items-center gap-2">
										<span className="font-medium">{result.intent.name}</span>
										<Badge>{result.intent.actionType}</Badge>
									</div>
									<p className="text-sm text-gray-600">Slug: {result.intent.slug}</p>
									<div className="flex items-center gap-2">
										<span className="text-sm">Confidence:</span>
										<span className={`font-medium ${getScoreColor(result.score)}`}>
											{(result.score * 100).toFixed(1)}%
										</span>
									</div>
								</div>
							</div>
						)}

						<div>
							<h4 className="font-medium mb-3">All Candidates</h4>
							<div className="space-y-2">
								{result.candidates.map((candidate, index) => (
									<div key={index} className="flex items-center justify-between p-3 border rounded-lg">
										<div>
											<p className="font-medium">{candidate.name}</p>
											<p className="text-sm text-gray-600">Threshold: {(candidate.threshold * 100).toFixed(1)}%</p>
										</div>
										<div className="flex items-center gap-2">
											{getScoreBadge(candidate.similarity, candidate.threshold)}
										</div>
									</div>
								))}
							</div>
						</div>

						{result.candidates.length === 0 && (
							<div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
								<p className="text-yellow-800">No intent candidates found</p>
							</div>
						)}
					</CardContent>
				</Card>
			)}
		</div>
	);
}
