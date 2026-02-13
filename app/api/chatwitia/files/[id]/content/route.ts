// app/api/chatwitia/files/[id]/content/route.ts
import { type NextRequest, NextResponse } from 'next/server'
import { openaiService } from '@/services/openai'
import { auth } from '@/auth'

/** ⬇︎ Route-segment config (Next.js 16) */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/chatwitia/files/[id]/content – recupera o conteúdo do arquivo
export async function GET(
  request: NextRequest,
  // params agora é **Promise**
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ↓ precisamos aguardar a promise para obter o valor
    const { id: fileId } = await params

    /** Autenticação opcional (Auth.js v5) */
    await auth()

    if (!fileId) {
      return NextResponse.json({ error: 'No file ID provided' }, { status: 400 })
    }

    console.log(`API: Recuperando conteúdo do arquivo ID: ${fileId}`)
    const response = await openaiService.retrieveFileContent(fileId)
    console.log('API: Conteúdo do arquivo recuperado com sucesso')

    // ─────────────────────────────────────────────────────────
    // Caso a OpenAI retorne um Blob (imagens, PDF etc.)
    if (response instanceof Blob) {
      const contentType = response.type || 'application/octet-stream'
      const arrayBuffer = await response.arrayBuffer()

      return new NextResponse(arrayBuffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="file-${fileId}${getExtensionByMime(
            contentType,
          )}"`,
        },
      })
    }

    // Caso seja JSON ou texto simples
    return NextResponse.json(response)
  } catch (error) {
    console.error('API: Erro ao recuperar conteúdo do arquivo:', error)

    let message = 'Erro ao recuperar conteúdo do arquivo'
    let details = ''

    if (error instanceof Error) {
      message = error.message
      details = error.stack ?? ''
      // 404 – arquivo não encontrado
      if (message.includes('No such file') || message.includes('404')) {
        return NextResponse.json(
          { error: 'Arquivo não encontrado', details },
          { status: 404 },
        )
      }
    } else if (typeof error === 'string') {
      message = error
    } else {
      details = JSON.stringify(error)
    }

    return NextResponse.json({ error: message, details }, { status: 500 })
  }
}

/** Mapeia MIME types → extensões de arquivo */
function getExtensionByMime(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'text/csv': '.csv',
    'text/plain': '.txt',
    'application/json': '.json',
  }
  return map[mimeType] ?? ''
}
