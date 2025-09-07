// __tests__/e2e/retrieval-router-intent-tool.test.mjs
// E2E: força a IA a usar a tool de busca de intents para a pergunta
// "qts advogados vcs tem?" quando RAG (local tools) estiver habilitado.

import { runLLMWithRetrievalTools } from '../../lib/ai-tools/llm-with-tools.ts';

// Para este teste, não dependemos de DB para montar contexto.
// Passamos um userId fake e accountId fake; a validação checa se a tool foi chamada.
function getFakeContext() {
  return { userId: 'test-user-fake', accountId: 'test-account-fake' };
}

async function main() {
  console.log('🔎 E2E: forçando uso de tool search_intents para: "qts advogados vcs tem?"');

  const ctx = getFakeContext();

  const messages = [
    {
      role: 'system',
      content:
        'Você é um assistente com acesso a ferramentas. Sempre que a pergunta pedir por um serviço/intenção configurada, use a ferramenta search_intents para localizar a intenção correspondente e responder com base nela. Se necessário, use a conta do usuário para buscar.',
    },
    {
      role: 'user',
      content: 'qts advogados vcs tem?',
    },
  ];

  try {
    const result = await runLLMWithRetrievalTools(messages, {
      userId: ctx.userId,
      accountId: ctx.accountId || undefined,
      model: process.env.DEFAULT_CHAT_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
    });

    const usedTool = (result.toolCalls || []).some((t) => t.toolName === 'search_intents');
    console.log('🧪 Tool calls:', result.toolCalls || []);

    if (!usedTool) {
      console.error('❌ A IA não chamou a tool search_intents. Verifique se o modelo suporta tools e se há intents relevantes.');
      process.exit(1);
    }

    console.log('✅ Passou: search_intents foi utilizada.');
    console.log('📝 Resposta final:', result.content);
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro ao executar teste:', err?.message || err);
    process.exit(1);
  }
}

main();
