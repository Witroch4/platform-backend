"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Play, 
  Pause, 
  RefreshCw, 
  Trash2, 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  XCircle,
  Eye,
  RotateCcw
} from "lucide-react";
import QueueStats from "./QueueStats";
import JobInspector from "./JobInspector";
import DLQManager from "./DLQManager";

interface QueueInfo {
  name: string;
  displayName: string;
  status: "active" | "paused" | "failed";
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  isPaused: boolean;
  processingRate: number;
  avgProcessingTime: number;
  lastProcessed?: string;
}

export default function QueueManagementDashboard() {
  const [queues, setQueues] = useState<QueueInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);

  useEffect(() => {
    fetchQueues();
    const interval = setInterval(fetchQueues, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchQueues = async () => {
    try {
      const response = await fetch("/api/admin/ai-integration/queues");
      if (response.ok) {
        const data = await response.json();
        setQueues(data.queues || []);
      }
    } catch (error) {
      console.error("Error fetching queues:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleQueueAction = async (queueName: string, action: "pause" | "resume" | "clean") => {
    try {
      const response = await fetch(`/api/admin/ai-integration/queues/${queueName}/${action}`, {
        method: "POST",
      });

      if (response.ok) {
        await fetchQueues();
      } else {
        alert(`Failed to ${action} queue`);
      }
    } catch (error) {
      console.error(`Error ${action}ing queue:`, error);
      alert(`Error ${action}ing queue`);
    }
  };

  const getStatusBadge = (status: string, isPaused: boolean) => {
    if (isPaused) {
      return <Badge variant="secondary">Paused</Badge>;
    }
    
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getQueueHealth = (queue: QueueInfo) => {
    if (queue.failed > queue.completed * 0.1) return "unhealthy";
    if (queue.waiting > 100) return "warning";
    return "healthy";
  };

  const getHealthIcon = (health: string) => {
    switch (health) {
      case "healthy":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case "unhealthy":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Queue Overview</TabsTrigger>
          <TabsTrigger value="stats">Statistics</TabsTrigger>
          <TabsTrigger value="jobs">Job Inspector</TabsTrigger>
          <TabsTrigger value="dlq">Dead Letter Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-semibold">AI Processing Queues</h2>
              <p className="text-gray-600">Monitor and control AI processing queues</p>
            </div>
            <Button onClick={fetchQueues} variant="outline" className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>

          <div className="grid gap-4">
            {queues.map((queue) => (
              <Card key={queue.name}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {getHealthIcon(getQueueHealth(queue))}
                        <CardTitle className="text-lg">{queue.displayName}</CardTitle>
                      </div>
                      {getStatusBadge(queue.status, queue.isPaused)}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        
                        onClick={() => setSelectedQueue(queue.name)}
                        className="flex items-center gap-1"
                      >
                        <Eye className="h-3 w-3" />
                        Inspect
                      </Button>
                      {queue.isPaused ? (
                        <Button
                          variant="outline"
                          
                          onClick={() => handleQueueAction(queue.name, "resume")}
                          className="flex items-center gap-1 text-green-600"
                        >
                          <Play className="h-3 w-3" />
                          Resume
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          
                          onClick={() => handleQueueAction(queue.name, "pause")}
                          className="flex items-center gap-1 text-yellow-600"
                        >
                          <Pause className="h-3 w-3" />
                          Pause
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        
                        onClick={() => handleQueueAction(queue.name, "clean")}
                        className="flex items-center gap-1 text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                        Clean
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div className="text-center">
                      <p className="font-medium text-blue-600">{queue.waiting}</p>
                      <p className="text-gray-600">Waiting</p>
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-yellow-600">{queue.active}</p>
                      <p className="text-gray-600">Active</p>
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-green-600">{queue.completed}</p>
                      <p className="text-gray-600">Completed</p>
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-red-600">{queue.failed}</p>
                      <p className="text-gray-600">Failed</p>
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-purple-600">{queue.delayed}</p>
                      <p className="text-gray-600">Delayed</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm text-gray-600">
                    <span>Rate: {queue.processingRate}/min</span>
                    <span>Avg Time: {queue.avgProcessingTime}ms</span>
                    {queue.lastProcessed && (
                      <span>Last: {new Date(queue.lastProcessed).toLocaleTimeString()}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {queues.length === 0 && (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-gray-500">No queues found</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="stats">
          <QueueStats />
        </TabsContent>

        <TabsContent value="jobs">
          <JobInspector selectedQueue={selectedQueue} />
        </TabsContent>

        <TabsContent value="dlq">
          <DLQManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}