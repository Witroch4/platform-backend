import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// A função principal que recebe a chamada (POST) do Dialogflow
export async function POST(request: NextRequest) {
  try {
    // Apenas para confirmar no seu console que o webhook foi acionado
    const body = await request.json();
    console.log("Webhook do Dialogflow recebido!");
    // console.log(JSON.stringify(body, null, 2)); // Descomente se quiser ver o que o Dialogflow enviou

    // 1. Crie o objeto da mensagem interativa que você quer enviar
    const interactiveMessageResponse = {
      fulfillmentMessages: [
        {
          payload: {
            whatsapp: {
              type: "interactive",
              interactive: {
                type: "button",
                header: {
                  type: "text",
                  text: "Precisa de Ajuda? 🙋‍♂️",
                },
                body: {
                  text: "Este é um teste de mensagem interativa. Por favor, selecione uma das opções abaixo.",
                },
                footer: {
                  text: "Teste de Webhook Simplificado",
                },
                action: {
                  buttons: [
                    {
                      type: "reply",
                      reply: {
                        id: "teste_opcao_1",
                        title: "Opção 1", // CORRIGIDO: Removida a aspa extra
                      },
                    },
                    {
                      type: "reply",
                      reply: {
                        id: "teste_opcao_2",
                        title: "Opção 2", // CORRIGIDO: Removida a aspa extra
                      },
                    },
                  ],
                },
              },
            },
          },
          platform: "PLATFORM_UNSPECIFIED",
        },
      ],
    };

    // 2. Responda diretamente ao Dialogflow com o objeto acima
    return NextResponse.json(interactiveMessageResponse);
  } catch (error) {
    console.error("Erro no webhook:", error);
    // Em caso de erro, responda ao Dialogflow para evitar timeouts
    return NextResponse.json(
      {
        fulfillmentText: "Ocorreu um erro no meu servidor. Tente novamente.",
      },
      { status: 500 }
    );
  }
}
