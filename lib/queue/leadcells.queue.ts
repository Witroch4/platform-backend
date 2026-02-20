import { Queue } from "bullmq";
import { getRedisInstance } from "@/lib/connections";

// Interfaces para diferentes tipos de jobs
interface IManuscritoJobData {
	leadID: string;
	textoDAprova: Array<{ output: string }>;
	nome?: string;
	telefone?: string;
	manuscrito: true;
}

interface IEspelhoJobData {
	leadID: string;
	textoDAprova: Array<{ output: string }>;
	nome?: string;
	telefone?: string;
	espelho?: true;
	espelhoparabiblioteca?: true;
}

interface IAnaliseJobData {
	leadID: string;
	analiseUrl?: string;
	argumentacaoUrl?: string;
	analisePreliminar?: any;
	nome?: string;
	telefone?: string;
	analise?: true;
	analiseSimulado?: true;
	analiseValidada?: true;
	analiseSimuladoValidada?: true;
	generatePdfInternally?: boolean;
	analiseData?: Record<string, unknown>;
}

type ILeadCellJobData = IManuscritoJobData | IEspelhoJobData | IAnaliseJobData;

// Queue unificada para todos os tipos de processamento
const leadCellsQueue = new Queue("leadCells", {
	connection: getRedisInstance(),
	defaultJobOptions: {
		removeOnComplete: 10,
		removeOnFail: 5,
		attempts: 3,
		backoff: {
			type: "exponential",
			delay: 2000,
		},
	},
});

// Função para adicionar job de manuscrito
export async function addManuscritoJob(data: IManuscritoJobData) {
	console.log("[Queue] Adicionando job de manuscrito:", data.leadID);

	const job = await leadCellsQueue.add("processLeadCell", data, {
		priority: 1, // Alta prioridade para manuscritos
		delay: 0,
	});

	console.log(`[Queue] Job de manuscrito criado com ID: ${job.id}`);
	return job;
}

// Função para adicionar job de espelho
export async function addEspelhoJob(data: IEspelhoJobData) {
	console.log("[Queue] Adicionando job de espelho:", data.leadID);

	const job = await leadCellsQueue.add("processLeadCell", data, {
		priority: 2, // Prioridade média para espelhos
		delay: 0,
	});

	console.log(`[Queue] Job de espelho criado com ID: ${job.id}`);
	return job;
}

// Função para adicionar job de análise
export async function addAnaliseJob(data: IAnaliseJobData) {
	console.log("[Queue] Adicionando job de análise:", data.leadID);

	const job = await leadCellsQueue.add("processLeadCell", data, {
		priority: 3, // Prioridade baixa para análises
		delay: 0,
	});

	console.log(`[Queue] Job de análise criado com ID: ${job.id}`);
	return job;
}

// Função genérica para adicionar qualquer tipo de job
export async function addLeadCellJob(data: ILeadCellJobData) {
	console.log("[Queue] Adicionando job de lead cell:", data.leadID);

	// Determinar prioridade baseada no tipo
	let priority = 3; // padrão
	if ("manuscrito" in data && data.manuscrito) priority = 1;
	else if (("espelho" in data && data.espelho) || ("espelhoparabiblioteca" in data && data.espelhoparabiblioteca))
		priority = 2;

	const job = await leadCellsQueue.add("processLeadCell", data, {
		priority,
		delay: 0,
	});

	console.log(`[Queue] Job de lead cell criado com ID: ${job.id}`);
	return job;
}

export { leadCellsQueue };
export type { ILeadCellJobData, IManuscritoJobData, IEspelhoJobData, IAnaliseJobData };
