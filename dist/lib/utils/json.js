"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toJson = toJson;
exports.toInputJson = toInputJson;
const client_1 = require("@prisma/client");
function toJson(value) {
    if (value === undefined || value === null) {
        return null;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Array.isArray(value)) {
        return value.map((v) => toJson(v));
    }
    if (typeof value === 'object') {
        const obj = {};
        for (const [k, v] of Object.entries(value)) {
            obj[k] = toJson(v);
        }
        return obj;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    return null;
}
function toInputJson(value) {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return client_1.Prisma.DbNull;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Array.isArray(value)) {
        return value.map(v => toInputJson(v));
    }
    if (typeof value === 'object') {
        const obj = {};
        for (const [k, v] of Object.entries(value)) {
            const converted = toInputJson(v);
            if (converted !== undefined) {
                obj[k] = converted;
            }
        }
        return obj;
    }
    if (typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean') {
        return value;
    }
    return client_1.Prisma.DbNull;
}
