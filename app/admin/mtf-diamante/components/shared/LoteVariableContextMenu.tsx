"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  Package, 
  X,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLotesVariables, type LoteVariable } from '../../hooks/useLotesVariables';

interface LoteVariableContextMenuProps {
  accountId: string;
  isOpen: boolean;
  onClose: () => void;
  onInsert: (text: string, position?: number) => void;
  position?: { x: number; y: number };
  className?: string;
}

export const LoteVariableContextMenu: React.FC<LoteVariableContextMenuProps> = ({
  accountId,
  isOpen,
  onClose,
  onInsert,
  position = { x: 0, y: 0 },
  className
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const { loteVariables, loading, error, insertLoteVariable, refreshLoteVariables } = useLotesVariables(
    accountId,
    onInsert
  );

  // Filtrar lotes baseado na busca
  const filteredLotes = loteVariables.filter(variable => {
    const matchesSearch = variable.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         variable.chave.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         variable.descricao.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  // Fechar menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  // Fechar menu com ESC
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  const handleLoteClick = (variable: LoteVariable) => {
    insertLoteVariable(variable.chave);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/20"
      style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
    >
      <Card
        ref={menuRef}
        className={cn(
          "absolute w-96 max-h-96 shadow-lg border bg-background",
          className
        )}
        style={{
          left: Math.min(position.x, window.innerWidth - 400),
          top: Math.min(position.y, window.innerHeight - 400),
        }}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4" />
              Inserir Lote
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          
          {/* Barra de busca */}
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Buscar lotes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 h-8 text-xs"
            />
          </div>

          {/* Título da seção */}
          <div className="flex gap-1">
            <Button
              variant="default"
              size="sm"
              className="h-6 px-2 text-xs"
            >
              <Package className="h-3 w-3 mr-1" />
              Lotes MTF Diamante
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <ScrollArea className="h-64">
            {loading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Carregando lotes...
              </div>
            ) : error ? (
              <div className="p-4 text-center text-sm text-destructive">
                {error}
              </div>
            ) : filteredLotes.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Nenhum lote encontrado
              </div>
            ) : (
              <div className="space-y-1 p-2">
                <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  Lotes Disponíveis
                </div>
                {filteredLotes.map((variable) => (
                  <Button
                    key={variable.id}
                    variant="ghost"
                    className="w-full justify-start h-auto p-2 text-left"
                    onClick={() => handleLoteClick(variable)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium truncate">
                          {variable.displayName}
                        </span>
                        <Badge 
                          variant={variable.isActive ? "default" : "secondary"} 
                          className="text-xs px-1 py-0"
                        >
                          {variable.isActive ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {variable.descricao}
                      </div>
                      {variable.loteData && (
                        <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                          <div>Valor: <span className="font-mono">{variable.loteData.valor}</span></div>
                          <div className="text-xs opacity-75">
                            {new Date(variable.loteData.dataInicio).toLocaleDateString('pt-BR')} - {new Date(variable.loteData.dataFim).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                      )}
                    </div>
                  </Button>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer com informações */}
          <div className="border-t p-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Info className="h-3 w-3" />
              <span>Clique para inserir o lote no texto</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};