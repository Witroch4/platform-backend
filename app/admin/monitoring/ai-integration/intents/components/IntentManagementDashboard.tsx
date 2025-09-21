"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, RefreshCw, BarChart3, TestTube } from "lucide-react";
import { toast } from "sonner";
import IntentForm from "./IntentForm";
import IntentTestingTool from "./IntentTestingTool";
import IntentAnalytics from "./IntentAnalytics";

interface Intent {
  id: string;
  name: string;
  slug: string;
  description?: string;
  actionType: string;
  similarityThreshold: number;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  template?: {
    id: string;
    name: string;
  };
}

export default function IntentManagementDashboard() {
  const [intents, setIntents] = useState<Intent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingIntent, setEditingIntent] = useState<Intent | null>(null);
  const [activeTab, setActiveTab] = useState("list");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [intentToDelete, setIntentToDelete] = useState<Intent | null>(null);

  useEffect(() => {
    fetchIntents();
  }, []);

  const fetchIntents = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/ai-integration/intents");
      if (response.ok) {
        const data = await response.json();
        setIntents(data.intents || []);
      }
    } catch (error) {
      console.error("Error fetching intents:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateIntent = () => {
    setEditingIntent(null);
    setShowForm(true);
  };

  const handleEditIntent = (intent: Intent) => {
    setEditingIntent(intent);
    setShowForm(true);
  };

  const handleDeleteIntent = async (intentId: string) => {
    const intent = intents.find(i => i.id === intentId);
    if (intent) {
      setIntentToDelete(intent);
      setShowDeleteDialog(true);
    }
  };

  const confirmDelete = async () => {
    if (!intentToDelete) return;

    try {
      const response = await fetch(`/api/admin/ai-integration/intents/${intentToDelete.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Intenção deletada com sucesso!");
        await fetchIntents();
      } else {
        toast.error("Erro ao deletar intenção");
      }
    } catch (error) {
      console.error("Error deleting intent:", error);
      toast.error("Erro ao deletar intenção");
    } finally {
      setShowDeleteDialog(false);
      setIntentToDelete(null);
    }
  };

  const handleRegenerateEmbedding = async (intentId: string) => {
    try {
      const response = await fetch(`/api/admin/ai-integration/intents/${intentId}/regenerate-embedding`, {
        method: "POST",
      });

      if (response.ok) {
        toast.success("Regeneração de embedding iniciada com sucesso!");
        await fetchIntents();
      } else {
        toast.error("Erro ao iniciar regeneração de embedding");
      }
    } catch (error) {
      console.error("Error regenerating embedding:", error);
      toast.error("Erro ao regenerar embedding");
    }
  };

  const handleFormSubmit = async () => {
    setShowForm(false);
    setEditingIntent(null);
    await fetchIntents();
  };

  const getActionTypeBadge = (actionType: string) => {
    const colors = {
      TEMPLATE: "bg-blue-100 text-blue-800",
      INTERACTIVE: "bg-green-100 text-green-800",
      TEXT: "bg-yellow-100 text-yellow-800",
      HUMAN_FALLBACK: "bg-red-100 text-red-800",
    };
    return colors[actionType as keyof typeof colors] || "bg-gray-100 text-gray-800";
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
          <TabsTrigger value="list">Intent List</TabsTrigger>
          <TabsTrigger value="testing">Testing Tool</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-semibold">Intents ({intents.length})</h2>
              <p className="text-gray-600">Manage AI intents for message classification</p>
            </div>
            <Button onClick={handleCreateIntent} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Intent
            </Button>
          </div>

          <div className="grid gap-4">
            {intents.map((intent) => (
              <Card key={intent.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg">{intent.name}</CardTitle>
                      <Badge className={getActionTypeBadge(intent.actionType)}>
                        {intent.actionType}
                      </Badge>
                      <Badge variant={intent.isActive ? "default" : "secondary"}>
                        {intent.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        
                        onClick={() => handleRegenerateEmbedding(intent.id)}
                        className="flex items-center gap-1"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Regenerate
                      </Button>
                      <Button
                        variant="outline"
                        
                        onClick={() => handleEditIntent(intent)}
                        className="flex items-center gap-1"
                      >
                        <Edit className="h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        
                        onClick={() => handleDeleteIntent(intent.id)}
                        className="flex items-center gap-1 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">{intent.description}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>Slug: {intent.slug}</span>
                      <span>Threshold: {intent.similarityThreshold}</span>
                      <span>Usage: {intent.usageCount}</span>
                      {intent.template && (
                        <span>Template: {intent.template.name}</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {intents.length === 0 && (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-gray-500 mb-4">No intents configured yet</p>
                <Button onClick={handleCreateIntent}>Create your first intent</Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="testing">
          <IntentTestingTool />
        </TabsContent>

        <TabsContent value="analytics">
          <IntentAnalytics />
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Global Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Global AI integration settings will be available here.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {showForm && (
        <IntentForm
          intent={editingIntent}
          onSubmit={handleFormSubmit}
          onCancel={() => {
            setShowForm(false);
            setEditingIntent(null);
          }}
        />
      )}

      {/* Dialog de confirmação de exclusão */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja deletar a intenção "{intentToDelete?.name}"? 
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Deletar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}