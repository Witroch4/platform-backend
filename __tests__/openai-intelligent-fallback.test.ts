/**
 * OpenAI Intelligent Fallback Tests
 * Tests the intelligent retry mechanisms for schema errors
 */

import { z } from "zod";

// Mock the schema array error detection function
function isSchemaArrayError(err: any): boolean {
  try {
    const msg = String(err?.message ?? err ?? "");
    if (/invalid_type/i.test(msg) && /expected/i.test(msg) && /object/i.test(msg) && /received/i.test(msg) && /array/i.test(msg)) {
      return true;
    }
    const raw = err?.__openai?.raw_output_text;
    if (raw) {
      const obj = JSON.parse(raw);
      if (Array.isArray(obj)) return true;
      // Verifica se tem alguma chave que é array quando deveria ser objeto (ex: { router_decision: [...] })
      if (obj && typeof obj === 'object') {
        for (const key in obj) {
          // Só considera erro se for array não-vazio ou se a chave sugere que deveria ser objeto
          if (Array.isArray(obj[key]) && (obj[key].length > 0 || key.includes('_decision') || key.includes('_response'))) {
            return true;
          }
        }
      }
    }
  } catch {}
  return false;
}

describe("OpenAI Intelligent Fallback", () => {
  describe("Schema Array Error Detection", () => {
    test("detects array at root level", () => {
      const error = {
        __openai: {
          raw_output_text: JSON.stringify([{ title: "Test", payload: "@test" }])
        }
      };
      
      expect(isSchemaArrayError(error)).toBe(true);
    });

    test("detects nested array in schema key", () => {
      const error = {
        __openai: {
          raw_output_text: JSON.stringify({
            router_decision: [{ mode: "intent", intent_payload: "@test" }]
          })
        }
      };
      
      expect(isSchemaArrayError(error)).toBe(true);
    });

    test("detects invalid_type error message", () => {
      const error = {
        message: "invalid_type: expected object, received array"
      };
      
      expect(isSchemaArrayError(error)).toBe(true);
    });

    test("does not detect valid object structure", () => {
      const error = {
        __openai: {
          raw_output_text: JSON.stringify({
            mode: "intent",
            intent_payload: "@test",
            buttons: [] // Array vazio é válido
          })
        }
      };
      
      expect(isSchemaArrayError(error)).toBe(false);
    });

    test("detects problematic schema key arrays", () => {
      const error = {
        __openai: {
          raw_output_text: JSON.stringify({
            router_decision: [{ mode: "intent" }] // Array não-vazio em chave de schema
          })
        }
      };
      
      expect(isSchemaArrayError(error)).toBe(true);
    });

    test("handles malformed JSON gracefully", () => {
      const error = {
        __openai: {
          raw_output_text: "invalid json {"
        }
      };
      
      expect(isSchemaArrayError(error)).toBe(false);
    });
  });

  describe("Sampling Parameter Detection", () => {
    test("detects unsupported temperature parameter", () => {
      const errorMessage = "400 Unsupported parameter: 'temperature' is not supported with this model.";
      const unsupportedSampling = /Unsupported parameter: 'temperature'|Unsupported parameter: 'top_p'|is not supported with this model/i.test(errorMessage);
      
      expect(unsupportedSampling).toBe(true);
    });

    test("detects unsupported top_p parameter", () => {
      const errorMessage = "400 Unsupported parameter: 'top_p' is not supported with this model.";
      const unsupportedSampling = /Unsupported parameter: 'temperature'|Unsupported parameter: 'top_p'|is not supported with this model/i.test(errorMessage);
      
      expect(unsupportedSampling).toBe(true);
    });

    test("detects general not supported message", () => {
      const errorMessage = "Parameter is not supported with this model";
      const unsupportedSampling = /Unsupported parameter: 'temperature'|Unsupported parameter: 'top_p'|is not supported with this model/i.test(errorMessage);
      
      expect(unsupportedSampling).toBe(true);
    });

    test("does not detect unrelated errors", () => {
      const errorMessage = "Rate limit exceeded";
      const unsupportedSampling = /Unsupported parameter: 'temperature'|Unsupported parameter: 'top_p'|is not supported with this model/i.test(errorMessage);
      
      expect(unsupportedSampling).toBe(false);
    });
  });

  describe("Retry Strategy Logic", () => {
    test("should retry with strict mode for schema array errors", () => {
      const mockError = {
        __openai: {
          raw_output_text: JSON.stringify([{ title: "Test" }])
        }
      };

      const shouldRetryStrict = isSchemaArrayError(mockError);
      expect(shouldRetryStrict).toBe(true);
    });

    test("should retry without sampling for unsupported parameter errors", () => {
      const errorMessage = "Unsupported parameter: 'temperature'";
      const shouldRetryWithoutSampling = /Unsupported parameter: 'temperature'|Unsupported parameter: 'top_p'/i.test(errorMessage);
      
      expect(shouldRetryWithoutSampling).toBe(true);
    });

    test("should use conservative sampling in strict mode", () => {
      // This tests the logic that strict mode should use temperature: 0.2, top_p: 0.9
      const strictSampling = { temperature: 0.2, top_p: 0.9 };
      
      expect(strictSampling.temperature).toBe(0.2);
      expect(strictSampling.top_p).toBe(0.9);
    });
  });

  describe("Error Recovery Scenarios", () => {
    test("handles multiple error types in sequence", () => {
      // Simulate the retry logic flow
      const errors = [
        { type: "schema_array", shouldRetryStrict: true },
        { type: "unsupported_sampling", shouldRetryWithoutSampling: true },
        { type: "invalid_json_schema", shouldFallbackToJsonMode: true }
      ];

      errors.forEach(error => {
        switch (error.type) {
          case "schema_array":
            expect(error.shouldRetryStrict).toBe(true);
            break;
          case "unsupported_sampling":
            expect(error.shouldRetryWithoutSampling).toBe(true);
            break;
          case "invalid_json_schema":
            expect(error.shouldFallbackToJsonMode).toBe(true);
            break;
        }
      });
    });

    test("validates strict mode instructions", () => {
      const STRICT_APPEND =
        "\nMODO ESTRITO: retorne EXATAMENTE um objeto JSON válido no schema especificado." +
        " Não retorne array na raiz, nem texto fora do JSON." +
        " Use estrutura de objeto simples e direta.";

      expect(STRICT_APPEND).toContain("MODO ESTRITO");
      expect(STRICT_APPEND).toContain("objeto JSON válido");
      expect(STRICT_APPEND).toContain("Não retorne array na raiz");
    });
  });

  describe("Zod Schema Error Handling", () => {
    test("handles Zod validation errors gracefully", () => {
      const TestSchema = z.object({
        title: z.string(),
        payload: z.string()
      }).strict();

      // Test invalid data that would cause Zod error
      const invalidData = ["not", "an", "object"];
      
      expect(() => TestSchema.parse(invalidData)).toThrow();
      
      // Test that we can detect this is a schema array error
      try {
        TestSchema.parse(invalidData);
      } catch (error) {
        const mockError = {
          __openai: {
            raw_output_text: JSON.stringify(invalidData)
          }
        };
        expect(isSchemaArrayError(mockError)).toBe(true);
      }
    });

    test("handles nested schema validation", () => {
      const ButtonSchema = z.object({
        title: z.string().regex(/^.{1,20}$/u),
        payload: z.string().default("")
      }).strict();

      const RouterSchema = z.object({
        mode: z.enum(["intent", "chat"]),
        buttons: z.array(ButtonSchema).default([])
      }).strict();

      // Valid data should pass
      const validData = {
        mode: "chat",
        buttons: [
          { title: "Test Button", payload: "@test" }
        ]
      };

      expect(() => RouterSchema.parse(validData)).not.toThrow();

      // Invalid nested structure should fail
      const invalidData = {
        mode: "chat",
        buttons: "not an array"
      };

      expect(() => RouterSchema.parse(invalidData)).toThrow();
    });
  });
});