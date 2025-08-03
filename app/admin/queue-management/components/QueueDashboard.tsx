"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Pause, 
  Play,
  RefreshCw,
  Trash2
} from "lucide-react";

interface QueueStatus {
  name: string;
  status: "active" | "paused" | "error";
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export default function QueueDashboard() {
  const [queues, setQueues] = useState<QueueStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);

  useEffect(() => {
    fetchQueues();
    const interval = setInterval(fetchQueues, 5000); // Atualiza a cada 5 segundos
    return () => clearInterval(interval);
  }, []);

  const fetchQueues = async () => {
    try {
      const response = await fetch("/api/admin/queue-management/queues");
      if (response.ok) {
        const data = await response.json();
        setQueues(data);
      }
    } catch (error) {
      console.error("Erro ao buscar filas:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleQueueAction = async (queueName: string, action: string) => {
    try {
      const response = await fetch(`/api/admin/queue-management/queues/${queueName}/${action}`, {
        method: "POST",
      });
      
      if (response.ok) {
        fetchQueues(); // Atualiza a lista
      }
    } catch (error) {
      console.error(`Erro ao executar ação ${action} na fila ${queueName}:`, error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500";
      case "paused": return "bg-yellow-500";
      case "error": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active": return <CheckCircle className="h-4 w-4" />;
      case "paused": return <Pause className="h-4 w-4" />;
      case "error": return <AlertTriangle className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Carregando filas...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Filas</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{queues.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jobs Aguardando</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {queues.reduce((sum, queue) => sum + queue.waiting, 0)}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jobs Ativos</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {queues.reduce((sum, queue) => sum + queue.active, 0)}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jobs Falharam</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {queues.reduce((sum, queue) => sum + queue.failed, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Queue List */}
      <Card>
        <CardHeader>
          <CardTitle>Filas do Sistema</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {queues.map((queue) => (
              <div
                key={queue.name}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(queue.status)}
                    <Badge className={getStatusColor(queue.status)}>
                      {queue.status}
                    </Badge>
                  </div>
                  <div>
                    <h3 className="font-semibold">{queue.name}</h3>
                    <div className="flex space-x-4 text-sm text-gray-600">
                      <span>Aguardando: {queue.waiting}</span>
                      <span>Ativo: {queue.active}</span>
                      <span>Concluído: {queue.completed}</span>
                      <span>Falhou: {queue.failed}</span>
                      {queue.delayed > 0 && <span>Atrasado: {queue.delayed}</span>}
                    </div>
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  {queue.status === "paused" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleQueueAction(queue.name, "resume")}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Retomar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleQueueAction(queue.name, "pause")}
                    >
                      <Pause className="h-4 w-4 mr-1" />
                      Pausar
                    </Button>
                  )}
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleQueueAction(queue.name, "retry-failed")}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Retry
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleQueueAction(queue.name, "clean")}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Limpar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}