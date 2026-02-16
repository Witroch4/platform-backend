import type React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageIcon } from "lucide-react";
import type { InteractiveMessage } from "../types";
import MinIOMediaUpload, { type MinIOMediaFile } from "../../shared/MinIOMediaUpload";

interface StickerConfigProps {
	message: InteractiveMessage;
	updateMessage: (updates: Partial<InteractiveMessage>) => void;
	uploadedFiles: MinIOMediaFile[];
	setUploadedFiles: React.Dispatch<React.SetStateAction<MinIOMediaFile[]>>;
}

export const StickerConfig: React.FC<StickerConfigProps> = ({
	message,
	updateMessage,
	uploadedFiles,
	setUploadedFiles,
}) => {
	const getSticker = () =>
		message.action && message.action.type === "sticker" ? message.action.action : { mediaId: "" };
	const sticker = getSticker();

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<ImageIcon className="h-4 w-4" />
					Configuração do Sticker
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div>
					<Label>Upload do Sticker</Label>
					<MinIOMediaUpload
						uploadedFiles={uploadedFiles}
						setUploadedFiles={setUploadedFiles}
						allowedTypes={["image/webp", "image/png", "image/jpeg"]}
						maxSizeMB={1}
						title="Upload de Sticker"
						description="Faça upload do sticker/figurinha (formato WebP recomendado)"
						maxFiles={1}
						onUploadComplete={(file) => {
							if (file.url) {
								updateMessage({
									action: {
										type: "sticker",
										action: {
											mediaId: file.url,
										},
									},
								});
							}
						}}
					/>
				</div>

				<div className="space-y-2">
					<Label>ID do Sticker (alternativo)</Label>
					<Input
						placeholder="YOUR_STICKER_MEDIA_ID"
						value={sticker.mediaId || ""}
						onChange={(e) =>
							updateMessage({
								action: {
									type: "sticker",
									action: {
										mediaId: e.target.value,
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
