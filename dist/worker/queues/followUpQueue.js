"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.followUpQueue = void 0;
// worker/queues/followUpQueue.ts
const bullmq_1 = require("bullmq");
const redis_1 = require("../../lib/redis");
/**
 * Cria a fila "contato-sem-clique" (ou outro nome que preferir).
 */
exports.followUpQueue = new bullmq_1.Queue("contato-sem-clique", // Nome da fila
{
    connection: redis_1.connection,
    defaultJobOptions: {
        removeOnComplete: true, // ou false, conforme necessidade
        removeOnFail: false,
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 1000,
        },
    },
});
