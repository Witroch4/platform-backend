'use client'

import React, { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Bold, 
  Italic, 
  Strikethrough, 
  List, 
  ListOrdered, 
  Quote,
  Save,
  X
} from 'lucide-react'

interface WhatsAppTextEditorProps {
  onSave: (text: string) => void
  onClose: () => void
  initialText?: string
  placeholder?: string
}

export function WhatsAppTextEditor({ 
  onSave, 
  onClose, 
  initialText = '', 
  placeholder = 'Digite sua mensagem de resposta...' 
}: WhatsAppTextEditorProps) {
  const [text, setText] = useState(initialText)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Função para aplicar formatação do WhatsApp
  const applyFormatting = (format: string) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = text.substring(start, end)

    if (selectedText) {
      let formattedText = ''
      
      switch (format) {
        case 'bold':
          formattedText = `*${selectedText}*`
          break
        case 'italic':
          formattedText = `_${selectedText}_`
          break
        case 'strikethrough':
          formattedText = `~${selectedText}~`
          break
        case 'code':
          formattedText = `\`${selectedText}\``
          break
        default:
          formattedText = selectedText
      }

      const newText = text.substring(0, start) + formattedText + text.substring(end)
      setText(newText)
      
      // Reposicionar cursor
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + formattedText.length, start + formattedText.length)
      }, 0)
    } else {
      // Se não há texto selecionado, inserir marcadores vazios
      let markers = ''
      
      switch (format) {
        case 'bold':
          markers = '**'
          break
        case 'italic':
          markers = '__'
          break
        case 'strikethrough':
          markers = '~~'
          break
        case 'code':
          markers = '``'
          break
      }

      const newText = text.substring(0, start) + markers + text.substring(end)
      setText(newText)
      
      // Posicionar cursor entre os marcadores
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + markers.length / 2, start + markers.length / 2)
      }, 0)
    }
  }

  // Função para inserir lista
  const insertList = (type: 'bullet' | 'numbered') => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const lines = text.substring(0, start).split('\n')
    const currentLineStart = text.lastIndexOf('\n', start - 1) + 1
    const currentLineEnd = text.indexOf('\n', start)
    const endPos = currentLineEnd === -1 ? text.length : currentLineEnd

    const prefix = type === 'bullet' ? '• ' : '1. '
    const newText = text.substring(0, currentLineStart) + prefix + text.substring(currentLineStart, endPos) + text.substring(endPos)
    
    setText(newText)
    
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, start + prefix.length)
    }, 0)
  }

  // Função para inserir citação
  const insertQuote = () => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const currentLineStart = text.lastIndexOf('\n', start - 1) + 1
    const currentLineEnd = text.indexOf('\n', start)
    const endPos = currentLineEnd === -1 ? text.length : currentLineEnd

    const newText = text.substring(0, currentLineStart) + '> ' + text.substring(currentLineStart, endPos) + text.substring(endPos)
    
    setText(newText)
    
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + 2, start + 2)
    }, 0)
  }

  // Preview do texto formatado
  const getPreviewText = () => {
    return text
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/~(.*?)~/g, '<del>$1</del>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-200 px-1 rounded">$1</code>')
      .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-gray-300 pl-4 italic">$1</blockquote>')
      .replace(/^• (.+)$/gm, '<li class="ml-4">$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li class="ml-4">$1</li>')
      .replace(/\n/g, '<br>')
  }

  const handleSave = () => {
    if (text.trim()) {
      onSave(text.trim())
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg font-semibold">
            Editor de Texto - Formatação WhatsApp
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Barra de Ferramentas */}
          <div className="flex flex-wrap gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyFormatting('bold')}
              title="Negrito (*texto*)"
            >
              <Bold className="h-4 w-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyFormatting('italic')}
              title="Itálico (_texto_)"
            >
              <Italic className="h-4 w-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyFormatting('strikethrough')}
              title="Tachado (~texto~)"
            >
              <Strikethrough className="h-4 w-4" />
            </Button>
            
            <div className="w-px h-6 bg-gray-300 mx-1" />
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => insertList('bullet')}
              title="Lista com marcadores"
            >
              <List className="h-4 w-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => insertList('numbered')}
              title="Lista numerada"
            >
              <ListOrdered className="h-4 w-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={insertQuote}
              title="Citação (> texto)"
            >
              <Quote className="h-4 w-4" />
            </Button>
          </div>

          {/* Dicas de Formatação */}
          <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
            <p className="font-medium mb-1">Dicas de formatação do WhatsApp:</p>
            <div className="grid grid-cols-2 gap-2">
              <span>*negrito* → <strong>negrito</strong></span>
              <span>_itálico_ → <em>itálico</em></span>
              <span>~tachado~ → <del>tachado</del></span>
              <span>`código` → <code className="bg-gray-200 px-1 rounded">código</code></span>
              <span>• lista → • lista</span>
              <span>&gt; citação → citação</span>
            </div>
          </div>

          {/* Editor de Texto */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Texto (Editor)</label>
              <Textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={placeholder}
                className="min-h-[200px] font-mono text-sm"
                rows={10}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Preview</label>
              <div 
                className="min-h-[200px] p-3 border rounded-md bg-white dark:bg-gray-950 text-sm overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: getPreviewText() }}
              />
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!text.trim()}>
              <Save className="h-4 w-4 mr-2" />
              Salvar Resposta
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}