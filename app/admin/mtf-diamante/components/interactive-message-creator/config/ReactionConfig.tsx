import type React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Smile } from "lucide-react";
import type { InteractiveMessage } from "../types";

interface ReactionConfigProps {
	message: InteractiveMessage;
	updateMessage: (updates: Partial<InteractiveMessage>) => void;
}

export const ReactionConfig: React.FC<ReactionConfigProps> = ({ message, updateMessage }) => {
	const commonEmojis = ["😀", "😂", "❤️", "👍", "👎", "😢", "😡", "😮", "🎉", "🔥"];

	const getReaction = () =>
		message.action && message.action.type === "reaction" ? message.action.action : { messageId: "", emoji: "" };
	const reaction = getReaction();

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Smile className="h-4 w-4" />
					Configuração da Reação
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2">
					<Label>ID da Mensagem Original</Label>
					<Input
						placeholder="wamid.xxx..."
						value={reaction.messageId || ""}
						onChange={(e) =>
							updateMessage({
								action: {
									type: "reaction",
									action: {
										...reaction,
										messageId: e.target.value,
									},
								},
							})
						}
					/>
				</div>

				<div className="space-y-2">
					<Label>Emoji da Reação</Label>
					<div className="flex flex-wrap gap-2 mb-2">
						{commonEmojis.map((emoji) => (
							<Button
								key={emoji}
								variant={reaction.emoji === emoji ? "default" : "outline"}
								onClick={() =>
									updateMessage({
										action: {
											type: "reaction",
											action: {
												...reaction,
												emoji,
											},
										},
									})
								}
							>
								{emoji}
							</Button>
						))}
					</div>
					<Input
						placeholder="😀"
						value={reaction.emoji || ""}
						onChange={(e) =>
							updateMessage({
								action: {
									type: "reaction",
									action: {
										...reaction,
										emoji: e.target.value,
									},
								},
							})
						}
					/>
				</div>
			</CardContent>
		</Card>
	);
};
