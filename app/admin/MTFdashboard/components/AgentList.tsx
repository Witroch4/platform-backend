'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, MoreHorizontal, Plus } from 'lucide-react';
import type { AgentBlueprint } from '../types';

interface AgentListProps {
  agents: AgentBlueprint[];
  selectedId?: string | null;
  isLoading?: boolean;
  onCreate: () => void;
  onSelect: (agent: AgentBlueprint) => void;
  onRemove: (agent: AgentBlueprint) => Promise<void>;
}

export function AgentList({ agents, selectedId, isLoading, onCreate, onSelect, onRemove }: AgentListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Button className="w-full" onClick={onCreate}>
          <Plus className="h-4 w-4 mr-2" /> Novo agente
        </Button>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button className="w-full" onClick={onCreate}>
        <Plus className="h-4 w-4 mr-2" /> Novo agente
      </Button>
      <div className="space-y-3">
        {agents.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">Nenhum agente criado ainda</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Clique em “Novo agente” para desenhar o primeiro especialista MTF.
              </p>
            </CardContent>
          </Card>
        ) : (
          agents.map((agent) => (
            <Card
              key={agent.id}
              className={cn(
                'transition cursor-pointer hover:border-primary/50',
                selectedId === agent.id ? 'border-primary shadow-md' : ''
              )}
              onClick={() => onSelect(agent)}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  {agent.icon || '🤖'} {agent.name}
                </CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onSelect(agent)}>Editar</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={async (event) => {
                        event.stopPropagation();
                        await onRemove(agent);
                      }}
                    >
                      Remover
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <Badge variant="secondary" className="text-[10px]">
                    {agent.agentType}
                  </Badge>
                  <span className="flex items-center gap-1 text-xs">
                    <CalendarClock className="h-3 w-3" />
                    {new Date(agent.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                {agent.description ? (
                  <p className="text-sm leading-snug text-muted-foreground line-clamp-2">
                    {agent.description}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

