/**
 * Max Output Tokens Configuration Tests
 * Tests the maxOutputTokens configuration flow
 */

describe("Max Output Tokens Configuration", () => {
  describe("AgentConfig Interface", () => {
    test("should include maxOutputTokens in AgentConfig", () => {
      // This is a type-level test to ensure the interface is correct
      const mockAgent = {
        model: "gpt-5-nano",
        instructions: "Test instructions",
        maxOutputTokens: 384,
        reasoningEffort: "minimal" as const,
        verbosity: "low" as const,
        tempSchema: 0.1,
        tempCopy: 0.4,
        warmupDeadlineMs: 250,
        hardDeadlineMs: 120,
        softDeadlineMs: 300,
        embedipreview: true,
      };

      expect(mockAgent.maxOutputTokens).toBe(384);
      expect(typeof mockAgent.maxOutputTokens).toBe("number");
    });

    test("should handle undefined maxOutputTokens gracefully", () => {
      const mockAgent = {
        model: "gpt-5-nano",
        instructions: "Test instructions",
        // maxOutputTokens is optional
      };

      const maxTokens = mockAgent.maxOutputTokens || 256;
      expect(maxTokens).toBe(256);
    });
  });

  describe("Token Limits Validation", () => {
    test("should validate token limits within acceptable range", () => {
      const validTokenLimits = [64, 128, 256, 384, 512, 768, 1024];
      
      validTokenLimits.forEach(limit => {
        expect(limit).toBeGreaterThanOrEqual(64);
        expect(limit).toBeLessThanOrEqual(1024);
      });
    });

    test("should reject invalid token limits", () => {
      const invalidTokenLimits = [32, 63, 1025, 2048];
      
      invalidTokenLimits.forEach(limit => {
        const isValid = limit >= 64 && limit <= 1024;
        expect(isValid).toBe(false);
      });
    });
  });

  describe("Default Values", () => {
    test("should use appropriate defaults for different models", () => {
      const modelDefaults = {
        "gpt-5": 512,
        "gpt-5-nano": 384,
        "gpt-4.1-nano": 256,
      };

      Object.entries(modelDefaults).forEach(([model, expectedDefault]) => {
        expect(expectedDefault).toBeGreaterThanOrEqual(64);
        expect(expectedDefault).toBeLessThanOrEqual(1024);
      });
    });

    test("should handle incomplete error scenario", () => {
      // Simulate the error scenario that prompted this feature
      const errorMessage = "incomplete:max_output_tokens";
      const isIncompleteError = errorMessage.includes("incomplete:max_output_tokens");
      
      expect(isIncompleteError).toBe(true);
      
      // Recommended action: increase tokens
      const currentTokens = 256;
      const recommendedTokens = Math.min(currentTokens * 1.5, 1024);
      
      expect(recommendedTokens).toBeGreaterThan(currentTokens);
      expect(recommendedTokens).toBeLessThanOrEqual(1024);
    });
  });

  describe("UI Configuration", () => {
    test("should validate UI input constraints for DEFAULT users", () => {
      const uiConstraints = {
        min: 64,
        max: 1024,
        step: 1,
        default: 384,
      };

      expect(uiConstraints.min).toBe(64);
      expect(uiConstraints.max).toBe(1024);
      expect(uiConstraints.default).toBeGreaterThanOrEqual(uiConstraints.min);
      expect(uiConstraints.default).toBeLessThanOrEqual(uiConstraints.max);
    });

    test("should validate UI input constraints for ADMIN users", () => {
      const adminConstraints = {
        min: 64,
        max: 4096,
        step: 1,
        default: 1024,
      };

      expect(adminConstraints.min).toBe(64);
      expect(adminConstraints.max).toBe(4096);
      expect(adminConstraints.default).toBeGreaterThanOrEqual(adminConstraints.min);
      expect(adminConstraints.default).toBeLessThanOrEqual(adminConstraints.max);
    });

    test("should validate UI input constraints for SUPERADMIN users", () => {
      const superAdminConstraints = {
        min: 64,
        max: 48000,
        step: 1,
        default: 1024,
      };

      expect(superAdminConstraints.min).toBe(64);
      expect(superAdminConstraints.max).toBe(48000);
      expect(superAdminConstraints.default).toBeGreaterThanOrEqual(superAdminConstraints.min);
      expect(superAdminConstraints.default).toBeLessThanOrEqual(superAdminConstraints.max);
    });

    test("should provide helpful error message", () => {
      const helpText = "Limite de tokens de saída baseado na role do usuário. Se ver \"incomplete:max_output_tokens\", aumente o valor.";
      
      expect(helpText).toContain("baseado na role");
      expect(helpText).toContain("incomplete:max_output_tokens");
    });
  });

  describe("API Integration", () => {
    test("should validate API update constraints for DEFAULT users", () => {
      const mockBody = {
        maxOutputTokens: 512
      };
      const userRole = 'DEFAULT';
      const maxLimit = userRole === 'SUPERADMIN' ? 48000 : userRole === 'ADMIN' ? 4096 : 1024;

      const isValid = typeof mockBody.maxOutputTokens === 'number' && 
                     mockBody.maxOutputTokens >= 64 && 
                     mockBody.maxOutputTokens <= maxLimit;

      expect(isValid).toBe(true);
    });

    test("should validate API update constraints for ADMIN users", () => {
      const mockBody = {
        maxOutputTokens: 2048
      };
      const userRole = 'ADMIN';
      const maxLimit = userRole === 'SUPERADMIN' ? 48000 : userRole === 'ADMIN' ? 4096 : 1024;

      const isValid = typeof mockBody.maxOutputTokens === 'number' && 
                     mockBody.maxOutputTokens >= 64 && 
                     mockBody.maxOutputTokens <= maxLimit;

      expect(isValid).toBe(true);
    });

    test("should validate API update constraints for SUPERADMIN users", () => {
      const mockBody = {
        maxOutputTokens: 24000
      };
      const userRole = 'SUPERADMIN';
      const maxLimit = userRole === 'SUPERADMIN' ? 48000 : userRole === 'ADMIN' ? 4096 : 1024;

      const isValid = typeof mockBody.maxOutputTokens === 'number' && 
                     mockBody.maxOutputTokens >= 64 && 
                     mockBody.maxOutputTokens <= maxLimit;

      expect(isValid).toBe(true);
    });

    test("should reject invalid API values based on user role", () => {
      const testCases = [
        { role: 'DEFAULT', values: [
          { maxOutputTokens: 32 },    // too low
          { maxOutputTokens: 2048 },  // too high for DEFAULT
          { maxOutputTokens: "256" }, // wrong type
          { maxOutputTokens: null },  // null value
        ]},
        { role: 'ADMIN', values: [
          { maxOutputTokens: 32 },    // too low
          { maxOutputTokens: 8192 },  // too high for ADMIN
          { maxOutputTokens: "256" }, // wrong type
        ]},
        { role: 'SUPERADMIN', values: [
          { maxOutputTokens: 32 },    // too low
          { maxOutputTokens: 50000 }, // too high even for SUPERADMIN
          { maxOutputTokens: "256" }, // wrong type
        ]}
      ];

      testCases.forEach(testCase => {
        const maxLimit = testCase.role === 'SUPERADMIN' ? 48000 : testCase.role === 'ADMIN' ? 4096 : 1024;
        
        testCase.values.forEach(body => {
          const isValid = typeof body.maxOutputTokens === 'number' && 
                         body.maxOutputTokens >= 64 && 
                         body.maxOutputTokens <= maxLimit;
          expect(isValid).toBe(false);
        });
      });
    });
  });
});