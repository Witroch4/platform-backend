// types/agendamento.ts
export interface Agendamento {
	id: string;
	userId: string;
	accountId: string;
	Data: Date;
	Descricao: string;
	Facebook: boolean;
	Instagram: boolean;
	Linkedin: boolean;
	X: boolean;
	Stories: boolean;
	Reels: boolean;
	PostNormal: boolean;
	Diario: boolean;
	Semanal: boolean;
	Randomizar: boolean;
	TratarComoUnicoPost: boolean;
	TratarComoPostagensIndividuais: boolean;
	Concluido_FB: boolean;
	Concluido_IG: boolean;
	Concluido_LK: boolean;
	Concluido_X: boolean;
	createdAt: Date;
	midias: Array<{
		id: string;
		url: string;
		mime_type: string;
		thumbnail_url?: string;
		contador: number;
		createdAt: Date;
	}>;
}
