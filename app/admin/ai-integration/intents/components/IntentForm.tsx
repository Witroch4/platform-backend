"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X } from "lucide-react";

interface Intent {
  id: string;
  name: string;
  slug: string;
  description?: string;
  actionType: string;
  similarityThreshold: number;
  isActive: boolean;
  templateId?: string;
}

interface Template {
  id: string;
  name: string;
  type: string;
}

interface IntentFormProps {
  intent?: Intent | null;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function IntentForm({ intent, onSubmit, onCancel }: IntentFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    actionType: "TEMPLATE",
    similarityThreshold: 0.8,
    isActive: true,
    templateId: "",
  });
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (intent) {
      setFormData({
        name: intent.name,
        slug: intent.slug,
        description: intent.description || "",
        actionType: intent.actionType,
        similarityThreshold: intent.similarityThreshold,
        isActive: intent.isActive,
        templateId: intent.templateId || "",
      });
    }
    fetchTemplates();
  }, [intent]);

  const fetchTemplates = async () => {
    try {
      const response = await fetch("/api/admin/templates");
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  };

  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      slug: prev.slug || generateSlug(name)
    }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!formData.slug.trim()) {
      newErrors.slug = "Slug is required";
    } else if (!/^[a-z0-9-]+$/.test(formData.slug)) {
      newErrors.slug = "Slug must contain only lowercase letters, numbers, and hyphens";
    }

    if (formData.similarityThreshold < 0 || formData.similarityThreshold > 1) {
      newErrors.similarityThreshold = "Similarity threshold must be between 0 and 1";
    }

    if (formData.actionType === "TEMPLATE" && !formData.templateId) {
      newErrors.templateId = "Template is required for TEMPLATE action type";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setLoading(true);
    try {
      const url = intent 
        ? `/api/admin/ai-integration/intents/${intent.id}`
        : "/api/admin/ai-integration/intents";
      
      const method = intent ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        onSubmit();
      } else {
        const errorData = await response.json();
        alert(errorData.error || "Failed to save intent");
      }
    } catch (error) {
      console.error("Error saving intent:", error);
      alert("Error saving intent");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {intent ? "Edit Intent" : "Create Intent"}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g., Track Order"
                />
                {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
              </div>
              <div>
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                  placeholder="e.g., track-order"
                />
                {errors.slug && <p className="text-sm text-red-600">{errors.slug}</p>}
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe what this intent handles..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="actionType">Action Type *</Label>
                <Select
                  value={formData.actionType}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, actionType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEMPLATE">Template</SelectItem>
                    <SelectItem value="INTERACTIVE">Interactive</SelectItem>
                    <SelectItem value="TEXT">Text</SelectItem>
                    <SelectItem value="HUMAN_FALLBACK">Human Fallback</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="similarityThreshold">Similarity Threshold</Label>
                <Input
                  id="similarityThreshold"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={formData.similarityThreshold}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    similarityThreshold: parseFloat(e.target.value) || 0 
                  }))}
                />
                {errors.similarityThreshold && (
                  <p className="text-sm text-red-600">{errors.similarityThreshold}</p>
                )}
              </div>
            </div>

            {formData.actionType === "TEMPLATE" && (
              <div>
                <Label htmlFor="templateId">Template *</Label>
                <Select
                  value={formData.templateId}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, templateId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name} ({template.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.templateId && (
                  <p className="text-sm text-red-600">{errors.templateId}</p>
                )}
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
              />
              <Label htmlFor="isActive">Active</Label>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : intent ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}