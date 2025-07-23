'use client';

import type React from 'react';
import { useState } from 'react';
import { Download, Maximize2, X, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface ImageDisplayProps {
  imageData: string; // Base64 string
  prompt?: string;
  revisedPrompt?: string;
  className?: string;
  onDownload?: () => void;
}

const ImageDisplay: React.FC<ImageDisplayProps> = ({
  imageData,
  prompt,
  revisedPrompt,
  className = '',
  onDownload
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Converter base64 para URL da imagem
  const imageUrl = `data:image/png;base64,${imageData}`;

  const handleDownload = () => {
    try {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `generated-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Imagem baixada com sucesso!');
      onDownload?.();
    } catch (error) {
      console.error('Erro ao baixar imagem:', error);
      toast.error('Erro ao baixar imagem');
    }
  };

  const handleCopyPrompt = async (textToCopy: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedPrompt(true);
      toast.success('Prompt copiado!');
      
      setTimeout(() => {
        setCopiedPrompt(false);
      }, 2000);
    } catch (error) {
      console.error('Erro ao copiar prompt:', error);
      toast.error('Erro ao copiar prompt');
    }
  };

  const ExpandedView = () => (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
      <div className="max-w-4xl max-h-full bg-white rounded-lg overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-semibold">Imagem Gerada</h3>
          <button
            onClick={() => setIsExpanded(false)}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 max-h-[80vh] overflow-auto">
          <img
            src={imageUrl}
            alt={prompt || 'Imagem gerada'}
            className="w-full h-auto rounded-lg shadow-lg"
          />
          
          {/* Prompts */}
          <div className="mt-4 space-y-3">
            {prompt && (
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-sm text-gray-700">Prompt Original:</h4>
                  <button
                    onClick={() => handleCopyPrompt(prompt)}
                    className="p-1 hover:bg-gray-200 rounded"
                  >
                    {copiedPrompt ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-sm text-gray-600">{prompt}</p>
              </div>
            )}
            
            {revisedPrompt && revisedPrompt !== prompt && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-sm text-blue-700">Prompt Revisado:</h4>
                  <button
                    onClick={() => handleCopyPrompt(revisedPrompt)}
                    className="p-1 hover:bg-blue-200 rounded"
                  >
                    {copiedPrompt ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-sm text-blue-600">{revisedPrompt}</p>
              </div>
            )}
          </div>
          
          {/* Actions */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download size={16} />
              Baixar Imagem
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className={`relative group ${className}`}>
        <img
          src={imageUrl}
          alt={prompt || 'Imagem gerada'}
          className="w-full max-w-md rounded-lg shadow-md cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setIsExpanded(true)}
        />
        
        {/* Overlay com ações */}
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(true);
              }}
              className="p-2 bg-white bg-opacity-90 rounded-full hover:bg-opacity-100 transition-all"
              title="Visualizar em tela cheia"
            >
              <Maximize2 size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
              className="p-2 bg-white bg-opacity-90 rounded-full hover:bg-opacity-100 transition-all"
              title="Baixar imagem"
            >
              <Download size={16} />
            </button>
          </div>
        </div>
        
        {/* Informações do prompt */}
        {(prompt || revisedPrompt) && (
          <div className="mt-2 text-xs text-gray-500">
            <p className="truncate">
              {revisedPrompt || prompt}
            </p>
          </div>
        )}
      </div>
      
      {/* Modal expandido */}
      {isExpanded && <ExpandedView />}
    </>
  );
};

export default ImageDisplay; 