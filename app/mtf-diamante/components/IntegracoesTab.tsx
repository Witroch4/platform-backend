"use client";

import { DialogflowCaixasAgentes } from "./DialogflowCaixasAgentes";

interface IntegracoesTabProps {
	onCaixaSelected: (id: string | null) => void;
}

const IntegracoesTab = ({ onCaixaSelected }: IntegracoesTabProps) => {
	// Este componente agora atua como um wrapper, passando a função de callback
	// para o componente principal que contém toda a lógica.
	// A lógica de seleção de caixa será implementada dentro de DialogflowCaixasAgentes.
	return <DialogflowCaixasAgentes onCaixaSelected={onCaixaSelected} />;
};

export default IntegracoesTab;
