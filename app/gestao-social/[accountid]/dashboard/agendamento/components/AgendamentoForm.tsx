//app/[accountid]/dashboard/agendamento/components/AgendamentoForm.tsx
"use client";

import type React from "react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { DateTimePicker } from "./date-time-picker";
import LegendaInput from "./LegendaInput";
import MediaUploader from "./MediaUploader";
import PostTypeSelector from "./PostTypeSelector";
import AgendarFooter from "./AgendarFooter";
import type { UploadedFile } from "@/components/custom/FileUpload";

interface AgendamentoFormProps {
	dateTime: Date | undefined;
	setDateTime: React.Dispatch<React.SetStateAction<Date | undefined>>;
	tipoPostagem: string[];
	setTipoPostagem: React.Dispatch<React.SetStateAction<string[]>>;
	legenda: string;
	setLegenda: (legenda: string) => void;
	uploadedFiles: UploadedFile[];
	setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
	handleAgendar: () => void;
	uploading: boolean;
	setDrawerOpen: (open: boolean) => void;
	tratarMidiasComoUnica: boolean;
	setTratarMidiasComoUnica: React.Dispatch<React.SetStateAction<boolean>>;
	tratarMidiasComoIndividuais: boolean;
	setTratarMidiasComoIndividuais: React.Dispatch<React.SetStateAction<boolean>>;
}

const AgendamentoForm: React.FC<AgendamentoFormProps> = ({
	dateTime,
	setDateTime,
	tipoPostagem,
	setTipoPostagem,
	legenda,
	setLegenda,
	uploadedFiles,
	setUploadedFiles,
	handleAgendar,
	uploading,
	setDrawerOpen,
	tratarMidiasComoUnica,
	setTratarMidiasComoUnica,
	tratarMidiasComoIndividuais,
	setTratarMidiasComoIndividuais,
}) => {
	// Verifica se a postagem diária está ativada
	const isPostagemDiaria = useMemo(() => {
		return tipoPostagem.includes("Diario");
	}, [tipoPostagem]);

	return (
		<div className="flex flex-col h-full bg-background">
			<DrawerHeader className="border-b border-border">
				<DrawerTitle className="text-foreground">Agendar nova postagem</DrawerTitle>
				<DrawerDescription className="text-muted-foreground">
					Configure as informações do seu agendamento.
				</DrawerDescription>
			</DrawerHeader>

			<div className="flex flex-1 p-4 flex-col md:flex-row md:space-x-4 space-y-4 md:space-y-0">
				{/* Coluna 1: Tipo de Postagem e Data/Hora */}
				<div className="w-full md:w-1/3 flex flex-col space-y-6">
					<PostTypeSelector
						tipoPostagem={tipoPostagem}
						setTipoPostagem={setTipoPostagem}
						tratarMidiasComoUnica={tratarMidiasComoUnica}
						setTratarMidiasComoUnica={setTratarMidiasComoUnica}
						tratarMidiasComoIndividuais={tratarMidiasComoIndividuais}
						setTratarMidiasComoIndividuais={setTratarMidiasComoIndividuais}
					/>

					<DateTimePicker
						date={dateTime ?? new Date()}
						setDate={(d: Date | undefined) => {
							if (d !== undefined) setDateTime(d);
						}}
						isPostagemDiaria={isPostagemDiaria}
					/>
				</div>

				{/* Coluna 2: Legenda */}
				<div className="w-full md:w-1/3 flex flex-col space-y-4">
					<LegendaInput legenda={legenda} setLegenda={setLegenda} />
				</div>

				{/* Coluna 3: Upload de Mídia */}
				<div className="w-full md:w-1/3 flex flex-col space-y-4">
					<MediaUploader uploadedFiles={uploadedFiles} setUploadedFiles={setUploadedFiles} />
				</div>
			</div>

			<AgendarFooter onAgendar={handleAgendar} uploading={uploading} />
		</div>
	);
};

export default AgendamentoForm;
