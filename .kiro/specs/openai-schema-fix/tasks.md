# Implementation Plan

- [x] 1. Fix Zod schemas to avoid allOf/anyOf generation
  - Create dynamic schema factory functions by channel
  - Replace string `.min()/.max()` with regex patterns
  - Use `.nullable().default(null)` instead of `.optional()`
  - Ensure all objects use `.strict()`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 3.4_

- [x] 2. Implement structuredOrJson fallback pattern
  - Create the fallback function following the test route pattern
  - Add try/catch for Structured Outputs with JSON mode fallback
  - Include error code detection for `invalid_json_schema`
  - Add local Zod validation for JSON mode responses
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Add model capabilities detection system
  - Create MODEL_CAPS configuration with reasoning/structured/sampling flags
  - Implement dynamic parameter inclusion based on model capabilities
  - Add helper functions for GPT-5 detection and parameter normalization
  - Gate Structured Outputs by model capabilities
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 4. Update generation functions with new patterns
  - Update `generateWarmupButtons` to use structuredOrJson pattern
  - Update `routerLLM` to use corrected RouterDecision schema
  - Update `generateFreeChatButtons` to use corrected schema
  - Apply buildTextFormat with verbosity for GPT-5 models
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 5. Add schema compatibility tests
  - Create unit tests to verify schemas don't generate allOf/anyOf
  - Test zodTextFormat output format validation
  - Add regression tests for schema compatibility
  - Create lint checks for schema patterns
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
