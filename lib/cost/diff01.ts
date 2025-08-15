diff --git a/services/openai.ts b/services/openai.ts
@@
 class ServerOpenAIService implements IOpenAIService {
@@
   async createChatCompletion(messages: any[], options: ChatOptions = {}) {
@@
-      // Configurar opções para a requisição da Responses API
-      const requestOptions: any = {
-        model: actualModel,
-        input: [
-          {
-            role: "user",
-            content: inputContent,
-          },
-        ],
-        ...(systemText ? { instructions: systemText } : {}), // ✅ System prompt vai no campo correto
-        stream: false,
-        store: true,
-        parallel_tool_calls: true,
-        truncation: "disabled",
-        temperature: mergedOptions.temperature,
-        top_p: mergedOptions.top_p,
-        max_output_tokens: mergedOptions.max_tokens,
-      };
+      // Helper para clamp seguro
+      const clamp = (n: number | undefined, min: number, max: number) =>
+        typeof n === "number" ? Math.max(min, Math.min(max, n)) : undefined;
+
+      // Configurar parâmetros da Responses API (sem campos inválidos)
+      const requestParams: any = {
+        model: actualModel,
+        input: [
+          {
+            role: "user",
+            content: inputContent,
+          },
+        ],
+        ...(systemText ? { instructions: systemText } : {}),
+        store: true,
+        temperature: mergedOptions.temperature,
+        top_p: mergedOptions.top_p,
+        // Evita 400 por excesso de tokens de saída; ajuste se precisar
+        max_output_tokens: clamp(mergedOptions.max_tokens, 1, 8192) ?? 1024,
+      };
 
-      // Adicionar parâmetro reasoning para modelos da série O
-      if (isOSeriesModel) {
-        const effort = reasoningEffort || "medium";
-        requestOptions.reasoning = { effort };
-        console.log(
-          `🧠 Adicionando reasoning effort: ${effort} para modelo da série O`
-        );
-      }
+      // Adicionar parâmetro reasoning (O-series e GPT-5)
+      const isReasoningModel =
+        isOSeriesModel || actualModel.startsWith("gpt-5");
+      if (isReasoningModel) {
+        const effort = reasoningEffort || "medium";
+        requestParams.reasoning = { effort };
+        console.log(`🧠 Reasoning effort: ${effort} (${actualModel})`);
+      }
@@
-      // Usar a Responses API com cost tracking with deadline management
-      const response = await withDeadlineAbort(async (signal) => {
-        return await responsesCall(
-          this.client,
-          requestOptions.model,
-          requestOptions.input,
-          {
-            traceId: `chat-completion-${Date.now()}`,
-            intent: "chat_completion",
-          },
-          signal
-        );
-      }, 5000); // 5 second deadline for regular chat completions
+      // Usar a Responses API (agora passando params completos e options com signal)
+      const response = await withDeadlineAbort(async (signal) => {
+        return responsesCall(
+          this.client,
+          requestParams,
+          { traceId: `chat-completion-${Date.now()}`, intent: "chat_completion" },
+          { signal, timeout: 5000 }
+        );
+      }, 5000);
@@
       return {
         choices: [
           {
             message: {
               role: "assistant",
-              content: response.output_text || "",
+              content: response.output_text || "",
             },
           },
         ],
         // Incluir dados adicionais da Responses API
         responsesApiData: {
           id: response.id,
           model: response.model,
           usage: response.usage,
           created_at: response.created_at,
           status: response.status,
           output: response.output,
         },
       };
@@
   async askAboutPdf(
     fileId: string,
     question: string,
     options: ChatOptions = {}
   ): Promise<string> {
@@
-      const response = await withDeadlineAbort(async (signal) => {
-        return await responsesCall(
-          this.client,
-          mergedOptions.model!,
-          [
-            {
-              role: "user",
-              content: [
-                { type: "file", file_id: fileId },
-                { type: "text", text: question },
-              ],
-            },
-          ],
-          {
-            traceId: `pdf-question-${Date.now()}`,
-            intent: "pdf_analysis",
-          },
-          signal
-        );
-      }, 10000); // 10 second deadline for PDF analysis
+      const response = await withDeadlineAbort(async (signal) => {
+        return responsesCall(
+          this.client,
+          {
+            model: mergedOptions.model!,
+            input: [{
+              role: "user",
+              content: [
+                { type: "file", file_id: fileId },
+                { type: "text", text: question },
+              ],
+            }],
+            store: true,
+            temperature: mergedOptions.temperature,
+            max_output_tokens: 1024,
+          },
+          { traceId: `pdf-question-${Date.now()}`, intent: "pdf_analysis" },
+          { signal, timeout: 10_000 }
+        );
+      }, 10_000);
@@
   async generateShortTitlesBatch(
     intents: IntentCandidate[],
     agent: AgentConfig
   ): Promise<string[] | null> {
@@
-          const response = await responsesCall(
-            this.client,
-            agent.model,
-            [
-              {
-                role: "user",
-                content: [{ type: "text", text: prompt }],
-              },
-            ],
-            {
-              traceId: `short-titles-batch-${Date.now()}`,
-              intent: "short_titles_generation",
-            },
-            signal
-          );
+          const response = await responsesCall(
+            this.client,
+            {
+              model: agent.model,
+              input: [{ role: "user", content: [{ type: "text", text: prompt }] }],
+              store: false,
+              temperature: agent.tempSchema ?? 0.2,
+              max_output_tokens: 512,
+            },
+            { traceId: `short-titles-batch-${Date.now()}`, intent: "short_titles_generation" },
+            { signal, timeout: agent.tempSchema ? 300 : 250 }
+          );
@@
   async generateWarmupButtons(
     userText: string,
     candidates: IntentCandidate[],
     agent: AgentConfig
   ): Promise<WarmupButtonsResponse | null> {
@@
-        const response = await responsesCall(
-          this.client,
-          agent.model,
-          [
-            {
-              role: "user",
-              content: [{ type: "text", text: prompt }],
-            },
-          ],
-          {
-            traceId: `warmup-buttons-${Date.now()}`,
-            intent: "warmup_buttons_generation",
-          },
-          signal
-        );
+        const response = await responsesCall(
+          this.client,
+          {
+            model: agent.model,
+            input: [{ role: "user", content: [{ type: "text", text: prompt }] }],
+            store: false,
+            temperature: agent.tempCopy ?? 0.5,
+            max_output_tokens: 768,
+          },
+          { traceId: `warmup-buttons-${Date.now()}`, intent: "warmup_buttons_generation" },
+          { signal, timeout: 300 }
+        );
@@
   async routerLLM(
     userText: string,
     agent: AgentConfig
   ): Promise<RouterDecision | null> {
@@
-        const response = await responsesCall(
-          this.client,
-          agent.model,
-          [
-            {
-              role: "user",
-              content: [{ type: "text", text: prompt }],
-            },
-          ],
-          {
-            traceId: `router-llm-${Date.now()}`,
-            intent: "routing_decision",
-          },
-          signal
-        );
+        const response = await responsesCall(
+          this.client,
+          {
+            model: agent.model,
+            input: [{ role: "user", content: [{ type: "text", text: prompt }] }],
+            store: false,
+            temperature: agent.tempCopy ?? 0.3,
+            max_output_tokens: 768,
+          },
+          { traceId: `router-llm-${Date.now()}`, intent: "routing_decision" },
+          { signal, timeout: 300 }
+        );
