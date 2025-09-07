// __tests__/e2e/retrieval-tools-test.js
// Teste prático das retrieval tools - busca de intents

const { executeRetrievalTool } = require('../../lib/ai-tools/retrieval-tools');
const { runLLMWithRetrievalTools } = require('../../lib/ai-tools/llm-with-tools');

async function testIntentSearch() {
  console.log('🔍 TESTE PRÁTICO: Busca de Intents com Retrieval Tools');
  console.log('=' .repeat(60));
  
  // Simulando contexto do usuário (você precisa ajustar com IDs reais)
  const context = {
    userId: 'seu-user-id-aqui', // Substituir pelo seu ID
    accountId: 'seu-account-id-aqui', // Substituir pelo seu account ID
    assistantId: 'seu-assistant-id-aqui' // Opcional
  };
  
  console.log('📋 Contexto do teste:');
  console.log(`   - Pergunta: "Qual lingua o Witalo Rocha fala?"`);
  console.log(`   - Buscando entre os 3 intents parecidos criados`);
  console.log('');

  try {
    // Teste 1: Busca direta de intents
    console.log('🔧 TESTE 1: Busca direta com search_intents');
    console.log('-'.repeat(40));
    
    const intentSearchResult = await executeRetrievalTool(
      'search_intents',
      {
        query: 'lingua idioma Witalo Rocha fala',
        accountId: context.accountId
      },
      context
    );
    
    console.log('📊 Resultado da busca de intents:');
    console.log(intentSearchResult);
    console.log('');
    
    // Teste 2: LLM com tools automático
    console.log('🤖 TESTE 2: LLM com retrieval tools automático');
    console.log('-'.repeat(40));
    
    const messages = [
      {
        role: "system",
        content: `Você é um assistente que tem acesso a ferramentas para buscar informações.
Quando o usuário fizer perguntas, use as ferramentas disponíveis para encontrar respostas precisas.
Priorize sempre buscar informações atualizadas usando as ferramentas.`
      },
      {
        role: "user", 
        content: "Qual lingua o Witalo Rocha fala?"
      }
    ];
    
    const llmResult = await runLLMWithRetrievalTools(messages, {
      ...context,
      model: 'gpt-4o-mini',
      temperature: 0.3 // Baixa para ser mais determinístico
    });
    
    console.log('🎯 Resposta da IA com tools:');
    console.log(llmResult.content);
    console.log('');
    
    if (llmResult.toolCalls && llmResult.toolCalls.length > 0) {
      console.log('🛠️ Tools utilizadas pela IA:');
      llmResult.toolCalls.forEach((toolCall, index) => {
        console.log(`   ${index + 1}. ${toolCall.toolName}`);
        console.log(`      Parâmetros:`, toolCall.parameters);
        console.log(`      Resultado: ${toolCall.result.substring(0, 200)}...`);
        console.log('');
      });
    }
    
    // Teste 3: Diferentes variações da pergunta
    console.log('🔄 TESTE 3: Variações da pergunta');
    console.log('-'.repeat(40));
    
    const variations = [
      "O Witalo fala que idioma?",
      "Witalo Rocha idioma",
      "linguagem Witalo",
      "Qual o idioma do Witalo?"
    ];
    
    for (const variation of variations) {
      console.log(`🔍 Testando: "${variation}"`);
      
      const result = await executeRetrievalTool(
        'search_intents',
        {
          query: variation,
          accountId: context.accountId
        },
        context
      );
      
      // Mostra apenas primeira linha do resultado
      const firstLine = result.split('\n')[0];
      console.log(`   → ${firstLine}`);
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
    
    // Se der erro de conexão, mostra instruções
    if (error.message.includes('connect') || error.message.includes('database')) {
      console.log('');
      console.log('⚠️  INSTRUÇÕES PARA EXECUTAR O TESTE:');
      console.log('   1. Certifique-se que o Docker está rodando');
      console.log('   2. Execute: npm run dev');
      console.log('   3. Ajuste os IDs no arquivo de teste com seus dados reais');
      console.log('   4. Execute novamente: node __tests__/e2e/retrieval-tools-test.js');
    }
  }
}

// Função para buscar IDs automaticamente
async function findUserContext() {
  try {
    const { getPrismaInstance } = require('../../lib/connections');
    const prisma = getPrismaInstance();
    
    console.log('🔍 Buscando contexto do usuário automaticamente...');
    
    // Busca usuário com intents
    const userWithIntents = await prisma.user.findFirst({
      where: {
        intents: {
          some: {
            isActive: true
          }
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        accounts: {
          select: {
            id: true
          },
          take: 1
        },
        intents: {
          where: {
            isActive: true,
            name: {
              contains: 'Witalo',
              mode: 'insensitive'
            }
          },
          select: {
            id: true,
            name: true,
            description: true,
            slug: true
          },
          take: 5
        }
      }
    });
    
    if (userWithIntents) {
      console.log('✅ Contexto encontrado:');
      console.log(`   - Usuário: ${userWithIntents.name} (${userWithIntents.email})`);
      console.log(`   - User ID: ${userWithIntents.id}`);
      console.log(`   - Account ID: ${userWithIntents.accounts[0]?.id || 'N/A'}`);
      console.log('');
      console.log('📋 Intents relacionados encontrados:');
      userWithIntents.intents.forEach((intent, index) => {
        console.log(`   ${index + 1}. ${intent.name} (@${intent.slug})`);
        console.log(`      Descrição: ${intent.description || 'Sem descrição'}`);
        console.log('');
      });
      
      return {
        userId: userWithIntents.id,
        accountId: userWithIntents.accounts[0]?.id,
        intents: userWithIntents.intents
      };
    } else {
      console.log('⚠️  Nenhum usuário com intents relacionados ao Witalo encontrado');
      return null;
    }
    
  } catch (error) {
    console.error('❌ Erro ao buscar contexto:', error.message);
    return null;
  }
}

// Executar teste
async function main() {
  console.log('🚀 Iniciando teste de Retrieval Tools...');
  console.log('');
  
  // Tenta buscar contexto automaticamente
  const autoContext = await findUserContext();
  
  if (autoContext) {
    console.log('🎯 Executando teste com contexto encontrado...');
    console.log('');
    
    // Executa teste com contexto real
    const context = {
      userId: autoContext.userId,
      accountId: autoContext.accountId
    };
    
    await testIntentSearchWithContext(context);
    
  } else {
    console.log('⚠️  Execute o teste manual ajustando os IDs no código');
    await testIntentSearch();
  }
}

async function testIntentSearchWithContext(context) {
  console.log('🔍 TESTE COM CONTEXTO REAL');
  console.log('=' .repeat(60));
  
  try {
    // Busca direta
    console.log('🔧 Buscando intents para: "Qual lingua o Witalo Rocha fala?"');
    console.log('');
    
    const result = await executeRetrievalTool(
      'search_intents',
      {
        query: 'lingua idioma Witalo Rocha fala',
        accountId: context.accountId
      },
      context
    );
    
    console.log('📊 RESULTADO DA BUSCA:');
    console.log(result);
    console.log('');
    
    // Analisa se encontrou múltiplos intents parecidos
    if (result.includes('Intents encontrados:')) {
      console.log('✅ Sistema encontrou intents! Vamos ver qual foi escolhido...');
      
      // Conta quantos intents foram encontrados
      const intentCount = (result.match(/•/g) || []).length;
      console.log(`📊 Total de intents encontrados: ${intentCount}`);
      
      if (intentCount > 1) {
        console.log('🎯 EXCELENTE! Sistema encontrou múltiplos intents parecidos.');
        console.log('   Isso mostra que a busca está funcionando corretamente.');
      }
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testIntentSearch, findUserContext };
