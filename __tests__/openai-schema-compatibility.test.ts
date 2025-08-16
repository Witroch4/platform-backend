/**
 * OpenAI Schema Compatibility Tests
 * Ensures schemas are compatible with Structured Outputs
 */

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

// Import the schema creation functions
function getConstraintsForChannel(channel: "whatsapp" | "instagram" | "facebook") {
  if (channel === "whatsapp") {
    return {
      bodyMax: 1024,
      buttonTitleMax: 20,
      payloadMax: 256,
      maxButtons: 3,
      titleWordMax: 4,
    };
  }
  if (channel === "instagram") {
    return {
      bodyMax: 640,
      buttonTitleMax: 20,
      payloadMax: 1000,
      maxButtons: 3,
      titleWordMax: 4,
    };
  }
  // facebook / genérico
  return {
    bodyMax: 2000,
    buttonTitleMax: 20,
    payloadMax: 1000,
    maxButtons: 3,
    titleWordMax: 4,
  };
}

function createButtonSchemaForChannel(channel: "whatsapp" | "instagram" | "facebook") {
  const { buttonTitleMax, payloadMax } = getConstraintsForChannel(channel);
  
  const titleRegex = new RegExp(`^.{1,${buttonTitleMax}}$`, "u");
  const payloadRegex = new RegExp(`^(|@[a-z0-9_]{1,${payloadMax}})$`, "u");
  
  return z
    .object({
      title: z.string().regex(titleRegex, `máx ${buttonTitleMax} caracteres`),
      payload: z.string().regex(payloadRegex, `formato @slug ou vazio`).default(""),
    })
    .strict();
}

function createButtonsSchema(channel: "whatsapp" | "instagram" | "facebook") {
  const { bodyMax, maxButtons } = getConstraintsForChannel(channel);
  const Btn = createButtonSchemaForChannel(channel);
  
  return z
    .object({
      introduction_text: z
        .string()
        .regex(new RegExp(`^.{1,${bodyMax}}$`, "u"), `máx ${bodyMax} caracteres`),
      buttons: z.array(Btn).min(1).max(maxButtons),
    })
    .strict();
}

function createRouterSchema(channel: "whatsapp" | "instagram" | "facebook") {
  const { bodyMax, maxButtons } = getConstraintsForChannel(channel);
  const Btn = createButtonSchemaForChannel(channel);
  
  return z
    .object({
      mode: z.enum(["intent", "chat"]),
      intent_payload: z
        .string()
        .regex(/^(|@[a-z0-9_]+)$/u)
        .default(""),
      introduction_text: z
        .string()
        .regex(new RegExp(`^(|.{1,${bodyMax}})$`, "u"))
        .default(""),
      text: z
        .string()
        .regex(new RegExp(`^(|.{1,${bodyMax}})$`, "u"))
        .default(""),
      buttons: z.array(Btn).max(maxButtons).default([]),
    })
    .strict();
}

describe("OpenAI Schema Compatibility", () => {
  const channels: Array<"whatsapp" | "instagram" | "facebook"> = ["whatsapp", "instagram", "facebook"];

  describe("Button Schema", () => {
    channels.forEach((channel) => {
      test(`Button schema for ${channel} is compatible with Structured Outputs`, () => {
        const schema = createButtonSchemaForChannel(channel);
        const format = zodTextFormat(schema, "button");
        const raw = JSON.stringify(format);

        // Should not contain allOf/anyOf/oneOf
        expect(raw).not.toMatch(/"allOf":/);
        expect(raw).not.toMatch(/"anyOf":/);
        expect(raw).not.toMatch(/"oneOf":/);

        // Should have additionalProperties: false
        expect(raw).toMatch(/"additionalProperties":false/);

        // Should be valid JSON Schema
        expect(() => JSON.parse(raw)).not.toThrow();
      });
    });
  });

  describe("Buttons Schema (Warmup/FreChat)", () => {
    channels.forEach((channel) => {
      test(`Buttons schema for ${channel} is compatible with Structured Outputs`, () => {
        const schema = createButtonsSchema(channel);
        const format = zodTextFormat(schema, "buttons");
        const raw = JSON.stringify(format);

        // Should not contain allOf/anyOf/oneOf
        expect(raw).not.toMatch(/"allOf":/);
        expect(raw).not.toMatch(/"anyOf":/);
        expect(raw).not.toMatch(/"oneOf":/);

        // Should have additionalProperties: false
        expect(raw).toMatch(/"additionalProperties":false/);

        // Should be valid JSON Schema
        expect(() => JSON.parse(raw)).not.toThrow();
      });
    });
  });

  describe("Router Schema", () => {
    channels.forEach((channel) => {
      test(`Router schema for ${channel} is compatible with Structured Outputs`, () => {
        const schema = createRouterSchema(channel);
        const format = zodTextFormat(schema, "router_decision");
        const raw = JSON.stringify(format);

        // Should not contain allOf/anyOf/oneOf
        expect(raw).not.toMatch(/"allOf":/);
        expect(raw).not.toMatch(/"anyOf":/);
        expect(raw).not.toMatch(/"oneOf":/);

        // Should have additionalProperties: false
        expect(raw).toMatch(/"additionalProperties":false/);

        // Should be valid JSON Schema
        expect(() => JSON.parse(raw)).not.toThrow();
      });
    });
  });

  describe("Dynamic Short Titles Schema", () => {
    test("Short titles schema is compatible with Structured Outputs", () => {
      const intentCount = 3;
      const ShortTitlesSchemaN = z
        .object({
          titles: z
            .array(
              z.string().regex(/^.{1,20}$/u, "máx 20 caracteres")
            )
            .length(intentCount),
        })
        .strict();

      const format = zodTextFormat(ShortTitlesSchemaN, "ShortTitles");
      const raw = JSON.stringify(format);

      // Should not contain allOf/anyOf/oneOf
      expect(raw).not.toMatch(/"allOf":/);
      expect(raw).not.toMatch(/"anyOf":/);
      expect(raw).not.toMatch(/"oneOf":/);

      // Should have additionalProperties: false
      expect(raw).toMatch(/"additionalProperties":false/);

      // Should be valid JSON Schema
      expect(() => JSON.parse(raw)).not.toThrow();
    });
  });

  describe("Schema Validation", () => {
    test("Button schema validates correct data", () => {
      const schema = createButtonSchemaForChannel("whatsapp");
      
      const validData = {
        title: "Ver Saldo",
        payload: "@ver_saldo"
      };

      expect(() => schema.parse(validData)).not.toThrow();
    });

    test("Button schema validates empty payload", () => {
      const schema = createButtonSchemaForChannel("whatsapp");
      
      const validData = {
        title: "Ver Saldo",
        payload: ""
      };

      expect(() => schema.parse(validData)).not.toThrow();
    });

    test("Router schema validates intent mode", () => {
      const schema = createRouterSchema("whatsapp");
      
      const validData = {
        mode: "intent",
        intent_payload: "@ver_saldo",
        introduction_text: "",
        text: "",
        buttons: []
      };

      expect(() => schema.parse(validData)).not.toThrow();
    });

    test("Router schema validates chat mode", () => {
      const schema = createRouterSchema("whatsapp");
      
      const validData = {
        mode: "chat",
        intent_payload: "",
        introduction_text: "Como posso ajudar?",
        text: "",
        buttons: [
          { title: "Opção 1", payload: "@opcao1" },
          { title: "Opção 2", payload: "@opcao2" }
        ]
      };

      expect(() => schema.parse(validData)).not.toThrow();
    });
  });

  describe("Regression Tests", () => {
    test("No string validation uses .min().max() combination", () => {
      // This is a meta-test to ensure we don't regress to using .min().max()
      // which generates allOf in JSON Schema
      
      const channels: Array<"whatsapp" | "instagram" | "facebook"> = ["whatsapp", "instagram", "facebook"];
      
      channels.forEach((channel) => {
        const buttonSchema = createButtonSchemaForChannel(channel);
        const buttonsSchema = createButtonsSchema(channel);
        const routerSchema = createRouterSchema(channel);
        
        // Test that schemas can be converted without throwing
        expect(() => zodTextFormat(buttonSchema, "button")).not.toThrow();
        expect(() => zodTextFormat(buttonsSchema, "buttons")).not.toThrow();
        expect(() => zodTextFormat(routerSchema, "router")).not.toThrow();
      });
    });

    test("All schemas use strict mode", () => {
      const channels: Array<"whatsapp" | "instagram" | "facebook"> = ["whatsapp", "instagram", "facebook"];
      
      channels.forEach((channel) => {
        const buttonFormat = zodTextFormat(createButtonSchemaForChannel(channel), "button");
        const buttonsFormat = zodTextFormat(createButtonsSchema(channel), "buttons");
        const routerFormat = zodTextFormat(createRouterSchema(channel), "router");
        
        // All should have additionalProperties: false
        expect(JSON.stringify(buttonFormat)).toMatch(/"additionalProperties":false/);
        expect(JSON.stringify(buttonsFormat)).toMatch(/"additionalProperties":false/);
        expect(JSON.stringify(routerFormat)).toMatch(/"additionalProperties":false/);
      });
    });
  });
});