/**
 * Schema Utilities — Shared helpers for blueprint schema handling
 *
 * Converte schemas simplificados (formato UI) para JSON Schema válido
 * e enforça regras exigidas pela OpenAI structured outputs.
 */

import { jsonSchema } from "ai";

/**
 * Detecta se um objeto JSON é um schema simplificado ({"campo": "string"})
 * e converte para JSON Schema válido ({"type":"object","properties":{...}}).
 *
 * Formatos reconhecidos:
 *  - "string"           → {type:"string"}
 *  - "string (desc)"    → {type:"string", description:"desc"}
 *  - [{...}]            → {type:"array", items: convertido recursivamente}
 */
export function convertSimplifiedToJsonSchema(obj: Record<string, any>): Record<string, any> {
	// Já é JSON Schema válido
	if (obj.type === "object" && obj.properties) return obj;

	const properties: Record<string, any> = {};
	const required: string[] = [];

	for (const [key, value] of Object.entries(obj)) {
		required.push(key);

		if (typeof value === "string") {
			// "string" ou "string (descrição aqui)"
			const match = value.match(/^(\w+)\s*(?:\((.+)\))?$/);
			if (match) {
				const prop: Record<string, any> = { type: match[1] };
				if (match[2]) prop.description = match[2].trim();
				properties[key] = prop;
			} else {
				properties[key] = { type: "string", description: value };
			}
		} else if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object") {
			// [{titulo: "string", ...}] → array de objetos
			properties[key] = {
				type: "array",
				items: convertSimplifiedToJsonSchema(value[0]),
			};
		} else if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
			// ["string (desc)"]
			properties[key] = { type: "array", items: { type: "string" } };
		} else {
			properties[key] = { type: "string" };
		}
	}

	return { type: "object", properties, required, additionalProperties: false };
}

/**
 * Enforça additionalProperties: false em todos os objetos do schema.
 * Exigido pela OpenAI structured outputs.
 */
function enforceAdditionalProperties(node: Record<string, any>) {
	if (!node || typeof node !== "object") return;
	if (node.type === "object" && node.additionalProperties === undefined) {
		node.additionalProperties = false;
	}
	if (node.properties) {
		for (const val of Object.values(node.properties)) {
			enforceAdditionalProperties(val as Record<string, any>);
		}
	}
	if (node.items) enforceAdditionalProperties(node.items);
}

/**
 * Converte schemaDefinition (string JSON) em jsonSchema do Vercel AI SDK.
 * Auto-converte formato simplificado e enforça additionalProperties: false.
 *
 * @param schemaDefinition - JSON string do schema
 * @param logPrefix - Prefixo para logs (ex: "[AnalysisAgent]")
 */
export function buildSdkSchema(schemaDefinition: string, logPrefix = "[SchemaUtils]") {
	let parsedSchemaObj = JSON.parse(schemaDefinition);

	// Auto-convert simplified format → proper JSON Schema
	if (parsedSchemaObj && typeof parsedSchemaObj === "object" && parsedSchemaObj.type !== "object") {
		console.warn(
			`${logPrefix} ⚠️ Schema em formato simplificado detectado — auto-convertendo para JSON Schema válido`,
		);
		parsedSchemaObj = convertSimplifiedToJsonSchema(parsedSchemaObj);
		console.log(`${logPrefix} ✅ Schema convertido:`, JSON.stringify(parsedSchemaObj).slice(0, 200) + "...");
	}

	// Final validation
	if (!parsedSchemaObj || typeof parsedSchemaObj !== "object" || parsedSchemaObj.type !== "object") {
		throw new Error(
			`Schema inválido: raiz deve ter type "object", ` +
				`mas recebeu type "${parsedSchemaObj?.type ?? "undefined"}".`,
		);
	}

	enforceAdditionalProperties(parsedSchemaObj);
	return jsonSchema(parsedSchemaObj);
}
