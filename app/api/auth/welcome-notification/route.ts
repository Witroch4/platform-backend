import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Endpoint para verificar se o usuário é novo e enviar uma notificação de boas-vindas imediatamente.
 * Esta rota é chamada pela página de registro de rede social após o login.
 */
export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Buscar o usuário no banco de dados para verificar se é novo
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isNew: true }
    });

    // Se o usuário não existir ou não for novo, não enviar notificação
    if (!user || !user.isNew) {
      return NextResponse.json({
        success: false,
        message: "Usuário não é novo, notificação não enviada"
      });
    }

    // Verificar se o usuário já recebeu uma notificação de boas-vindas
    const existingNotification = await prisma.notification.findFirst({
      where: {
        userId: session.user.id,
        title: "Bem-vindo ao Socialwise Chatwit!"
      }
    });

    if (existingNotification) {
      console.log(`Usuário ${session.user.id} já recebeu notificação de boas-vindas anteriormente, ignorando`);

      // Atualizar o status do usuário para não novo
      await prisma.user.update({
        where: { id: session.user.id },
        data: { isNew: false }
      });

      return NextResponse.json({
        success: false,
        message: "Usuário já recebeu notificação de boas-vindas anteriormente"
      });
    }

    // Criar notificação de boas-vindas diretamente
    const title = "Bem-vindo ao Socialwise Chatwit!";
    const message = "Olá! Bem-vindo à plataforma Socialwise Chatwit. Aqui você pode gerenciar suas redes sociais, automatizar interações e muito mais. Explore todas as funcionalidades disponíveis e aproveite ao máximo nossa plataforma!";

    await prisma.notification.create({
      data: {
        userId: session.user.id,
        title,
        message,
        isRead: false
      }
    });

    // Marcar o usuário como não novo
    await prisma.user.update({
      where: { id: session.user.id },
      data: { isNew: false }
    });

    console.log(`Notificação de boas-vindas enviada com sucesso para o usuário ${session.user.id}`);

    return NextResponse.json({
      success: true,
      message: "Notificação de boas-vindas enviada e usuário atualizado"
    });
  } catch (error) {
    console.error("Erro ao processar notificação de boas-vindas:", error);
    return NextResponse.json({
      error: "Falha ao processar notificação de boas-vindas"
    }, { status: 500 });
  }
}