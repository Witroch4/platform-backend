import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// PATCH: Atualizar o status de leitura de uma notificação (apenas para SUPERADMIN)
export async function PATCH(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return new NextResponse("Não autorizado", { status: 401 });
    }

    // Verificar se o usuário é SUPERADMIN
    const adminUser = await prisma.user.findUnique({
      where: {
        id: session.user.id
      }
    });

    if (adminUser?.role !== "SUPERADMIN") {
      return new NextResponse("Acesso negado. Apenas SUPERADMIN pode acessar.", { status: 403 });
    }

    const body = await req.json();
    const { notificationId, isRead } = body;

    if (!notificationId) {
      return new NextResponse("ID da notificação é obrigatório", { status: 400 });
    }

    if (typeof isRead !== 'boolean') {
      return new NextResponse("Status de leitura deve ser um booleano", { status: 400 });
    }

    // Verificar se a notificação existe
    const notification = await prisma.notification.findUnique({
      where: {
        id: notificationId
      }
    });

    if (!notification) {
      return new NextResponse("Notificação não encontrada", { status: 404 });
    }

    // Atualizar o status de leitura
    const updatedNotification = await prisma.notification.update({
      where: {
        id: notificationId
      },
      data: {
        isRead
      }
    });

    return NextResponse.json({
      success: true,
      notification: updatedNotification
    });
  } catch (error) {
    console.error("[ADMIN_NOTIFICATION_STATUS_UPDATE]", error);
    return new NextResponse("Erro interno", { status: 500 });
  }
}