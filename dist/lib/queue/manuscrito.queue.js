"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.manuscritoQueue = exports.MANUSCRITO_QUEUE_NAME = void 0;
exports.addManuscritoJob = addManuscritoJob;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../lib/redis");
exports.MANUSCRITO_QUEUE_NAME = 'filaManuscrito';
exports.manuscritoQueue = new bullmq_1.Queue(exports.MANUSCRITO_QUEUE_NAME, { connection: redis_1.connection });
async function addManuscritoJob(data) {
    await exports.manuscritoQueue.add(`manuscrito-${data.leadID}`, data, {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
    });
    console.log(`[BullMQ] Job de manuscrito adicionado para leadID: ${data.leadID}`);
}
