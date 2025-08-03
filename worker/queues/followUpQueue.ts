// worker/queues/followUpQueue.ts
import { Queue } from "bullmq";
import { getRedisInstance } from "@/lib/connections";

/**
 * Define a interface com os dados que deseja enviar à fila.
 */
export interface IFollowUpJobData {
    leadId: string;
    automacaoId: string;
    quickReplyTexto?: string | null; // Agora permite string, null ou undefined
    followUpMsg: string;
    buttonPayload?: string;
  }


/**
 * Cria a fila "contato-sem-clique" (ou outro nome que preferir).
 */
export const followUpQueue = new Queue<IFollowUpJobData>(
  "contato-sem-clique", // Nome da fila
  {
    connection: getRedisInstance(),
    defaultJobOptions: {
      removeOnComplete: true, // ou false, conforme necessidade
      removeOnFail: false,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    },
  }
);
