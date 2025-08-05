// app/api/admin/credentials/test/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections';
import axios from 'axios';

/**
 * POST - Testa credenciais do WhatsApp
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      whatsappApiKey,
      phoneNumberId,
      whatsappBusinessAccountId,
      graphApiBaseUrl = 'https://graph.facebook.com/v22.0',
      testType = 'basic', // 'basic' | 'templates' | 'send_test'
      testPhoneNumber, // Para teste de envio
    } = body;

    // Validações básicas
    if (!whatsappApiKey || !phoneNumberId || !whatsappBusinessAccountId) {
      return NextResponse.json(
        { error: 'whatsappApiKey, phoneNumberId e whatsappBusinessAccountId são obrigatórios' },
        { status: 400 }
      );
    }

    console.log(`[Credentials Test API] Testando credenciais - Tipo: ${testType}`);

    const testResults: any = {
      testType,
      timestamp: new Date().toISOString(),
      results: {},
    };

    try {
      // Teste básico - verificar se as credenciais são válidas
      if (testType === 'basic' || testType === 'templates' || testType === 'send_test') {
        console.log('[Credentials Test] Executando teste básico de conectividade...');
        
        const basicTestUrl = `${graphApiBaseUrl}/${phoneNumberId}`;
        const basicResponse = await axios.get(basicTestUrl, {
          headers: {
            Authorization: `Bearer ${whatsappApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 segundos
        });

        testResults.results.basic = {
          success: true,
          status: basicResponse.status,
          data: {
            phoneNumberId: basicResponse.data.id,
            displayPhoneNumber: basicResponse.data.display_phone_number,
            verifiedName: basicResponse.data.verified_name,
            qualityRating: basicResponse.data.quality_rating,
          },
          message: 'Credenciais válidas e número verificado',
        };
      }

      // Teste de templates - listar templates disponíveis
      if (testType === 'templates' || testType === 'send_test') {
        console.log('[Credentials Test] Executando teste de templates...');
        
        const templatesUrl = `${graphApiBaseUrl}/${whatsappBusinessAccountId}/message_templates?limit=5`;
        const templatesResponse = await axios.get(templatesUrl, {
          headers: {
            Authorization: `Bearer ${whatsappApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000, // 15 segundos
        });

        testResults.results.templates = {
          success: true,
          status: templatesResponse.status,
          data: {
            totalTemplates: templatesResponse.data.data?.length || 0,
            templates: templatesResponse.data.data?.slice(0, 3).map((template: any) => ({
              id: template.id,
              name: template.name,
              status: template.status,
              category: template.category,
              language: template.language,
            })) || [],
          },
          message: `${templatesResponse.data.data?.length || 0} templates encontrados`,
        };
      }

      // Teste de envio - enviar mensagem de teste
      if (testType === 'send_test') {
        if (!testPhoneNumber) {
          testResults.results.send_test = {
            success: false,
            error: 'Número de telefone para teste é obrigatório',
          };
        } else {
          console.log('[Credentials Test] Executando teste de envio...');
          
          const sendUrl = `${graphApiBaseUrl}/${phoneNumberId}/messages`;
          const testMessage = {
            messaging_product: 'whatsapp',
            to: testPhoneNumber.replace(/\D/g, ''), // Remover caracteres não numéricos
            type: 'text',
            text: {
              body: `🧪 Teste de credenciais realizado em ${new Date().toLocaleString('pt-BR')}. Este é um teste automático do sistema.`,
            },
          };

          const sendResponse = await axios.post(sendUrl, testMessage, {
            headers: {
              Authorization: `Bearer ${whatsappApiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 15000, // 15 segundos
          });

          testResults.results.send_test = {
            success: true,
            status: sendResponse.status,
            data: {
              messageId: sendResponse.data.messages?.[0]?.id,
              to: testPhoneNumber,
            },
            message: 'Mensagem de teste enviada com sucesso',
          };
        }
      }

      // Calcular resultado geral
      const allTests = Object.values(testResults.results);
      const successfulTests = allTests.filter((test: any) => test.success);
      const overallSuccess = successfulTests.length === allTests.length;

      testResults.overall = {
        success: overallSuccess,
        testsRun: allTests.length,
        testsSuccessful: successfulTests.length,
        testsFailed: allTests.length - successfulTests.length,
        message: overallSuccess 
          ? 'Todas as credenciais foram testadas com sucesso' 
          : 'Alguns testes falharam. Verifique os detalhes.',
      };

      console.log(`[Credentials Test API] Teste concluído - Sucesso: ${overallSuccess}`);

      return NextResponse.json(testResults);

    } catch (apiError: any) {
      console.error('[Credentials Test] Erro na API do WhatsApp:', apiError.response?.data || apiError.message);

      // Analisar o tipo de erro
      let errorMessage = 'Erro desconhecido ao testar credenciais';
      let errorCode = 'UNKNOWN_ERROR';

      if (apiError.response) {
        const status = apiError.response.status;
        const errorData = apiError.response.data?.error;

        if (status === 401) {
          errorMessage = 'Token de acesso inválido ou expirado';
          errorCode = 'INVALID_TOKEN';
        } else if (status === 403) {
          errorMessage = 'Sem permissão para acessar este recurso';
          errorCode = 'FORBIDDEN';
        } else if (status === 404) {
          errorMessage = 'Recurso não encontrado. Verifique o Phone Number ID ou Business Account ID';
          errorCode = 'RESOURCE_NOT_FOUND';
        } else if (errorData) {
          errorMessage = `Erro da API Meta: [${errorData.code}] ${errorData.message}`;
          errorCode = errorData.code || 'API_ERROR';
        }
      } else if (apiError.code === 'ECONNABORTED') {
        errorMessage = 'Timeout na conexão com a API do WhatsApp';
        errorCode = 'TIMEOUT';
      } else if (apiError.code === 'ENOTFOUND' || apiError.code === 'ECONNREFUSED') {
        errorMessage = 'Não foi possível conectar com a API do WhatsApp';
        errorCode = 'CONNECTION_ERROR';
      }

      testResults.overall = {
        success: false,
        error: errorMessage,
        errorCode,
        testsRun: 1,
        testsSuccessful: 0,
        testsFailed: 1,
      };

      testResults.results.error = {
        success: false,
        error: errorMessage,
        errorCode,
        details: apiError.response?.data || apiError.message,
      };

      return NextResponse.json(testResults, { status: 200 }); // Retorna 200 mesmo com erro para mostrar detalhes
    }

  } catch (error) {
    console.error('[Credentials Test API] Erro interno:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}