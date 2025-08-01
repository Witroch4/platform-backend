'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Globe, User, FileText, MessageSquare } from 'lucide-react';
import type { TemplateLibraryWithCreator, TemplateLibraryContent } from '@/app/lib/template-library-service';
import { useTheme } from 'next-themes';

interface TemplatePreviewDialogProps {
  template: TemplateLibraryWithCreator | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplatePreviewDialog({ template, open, onOpenChange }: TemplatePreviewDialogProps) {
  const { theme } = useTheme();
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  if (!template) return null;

  const content = (template as any).content as TemplateLibraryContent | undefined;

  // Initialize variable values with examples
  React.useEffect(() => {
    if (content?.variables) {
      const initialValues: Record<string, string> = {};
      content.variables.forEach((variable, index) => {
        initialValues[variable] = `Example ${index + 1}`;
      });
      setVariableValues(initialValues);
    }
  }, [content?.variables]);

  const processText = (text: string): string => {
    return Object.entries(variableValues).reduce((processed, [key, value]) => {
      return processed.replace(new RegExp(`{{${key}}}`, 'g'), value || `{{${key}}}`);
    }, text);
  };

  const getTypeIcon = (type: string) => {
    return type === 'template' ? <FileText className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />;
  };

  const getScopeIcon = (scope: string) => {
    return scope === 'GLOBAL' ? <Globe className="h-4 w-4" /> : <User className="h-4 w-4" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {getTypeIcon(template.type)}
            <DialogTitle>{template.name}</DialogTitle>
            <div className="flex items-center gap-1">
              {getScopeIcon(template.scope)}
              <Badge variant={template.scope === 'GLOBAL' ? 'default' : 'secondary'}>
                {template.scope === 'GLOBAL' ? 'Global' : 'Account'}
              </Badge>
            </div>
          </div>
          {template.description && (
            <DialogDescription>{template.description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Template Details */}
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Template Information</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="capitalize">{template.type.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scope:</span>
                  <span className="capitalize">{template.scope.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created by:</span>
                  <span>{template.createdBy.name || template.createdBy.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Usage count:</span>
                  <span>{template.usageCount ?? 0}</span>
                </div>
                {template.category && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Category:</span>
                    <span>{template.category}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Language:</span>
                  <span>{template.language}</span>
                </div>
              </div>
            </div>

            {template.tags && template.tags.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Tags</h4>
                <div className="flex flex-wrap gap-2">
                  {template.tags.map((tag) => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Variable Controls */}
            {content?.variables && content.variables.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Variables</h4>
                <div className="space-y-2">
                  {content.variables.map((variable) => (
                    <div key={variable} className="space-y-1">
                      <Label htmlFor={variable} className="text-sm">
                        {variable}
                      </Label>
                      <Input
                        id={variable}
                        value={variableValues[variable] || ''}
                        onChange={(e) => setVariableValues(prev => ({
                          ...prev,
                          [variable]: e.target.value
                        }))}
                        placeholder={`Enter value for ${variable}`}
                        className="text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw Content */}
            <div>
              <h4 className="font-medium mb-2">Raw Content</h4>
              <div className="space-y-2 text-sm">
                {content.header && (
                  <div>
                    <span className="text-muted-foreground">Header:</span>
                    <div className="bg-muted p-2 rounded text-xs font-mono">
                      {content.header}
                    </div>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Body:</span>
                  <div className="bg-muted p-2 rounded text-xs font-mono">
                    {content.body}
                  </div>
                </div>
                {content.footer && (
                  <div>
                    <span className="text-muted-foreground">Footer:</span>
                    <div className="bg-muted p-2 rounded text-xs font-mono">
                      {content.footer}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* WhatsApp Preview */}
          <div className="space-y-4">
            <h4 className="font-medium">WhatsApp Preview</h4>
            <div 
              className={`whatsapp-preview rounded-lg p-4 max-w-sm mx-auto bg-cover bg-center ${
                theme === 'dark' 
                  ? "bg-[url('/fundo_whatsapp_black.jpg')]" 
                  : "bg-[url('/fundo_whatsapp.jpg')]"
              }`}
            >
              <Card className="bg-white dark:bg-gray-800 shadow-md">
                <CardContent className="p-3 space-y-2">
                  {content.header && (
                    <div className="font-semibold text-sm">
                      {processText(content.header)}
                    </div>
                  )}
                  
                  <div className="text-sm">
                    {processText(content.body)}
                  </div>
                  
                  {content.footer && (
                    <div className="text-xs text-muted-foreground">
                      {processText(content.footer)}
                    </div>
                  )}
                  
                  {content?.buttons && content.buttons.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {content.buttons.map((button, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          size="sm"
                          className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                          {processText(button.text)}
                        </Button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Approval Status */}
            {template.approvalRequests && (
              <div>
                <h4 className="font-medium mb-2">Approval Status</h4>
                <div className="space-y-2">
                  {template.approvalRequests && template.approvalRequests.length > 0 ? (
                    template.approvalRequests.map((request) => (
                      <div key={request.id} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <Badge 
                            variant={
                              request.status === 'approved' ? 'default' :
                              request.status === 'rejected' ? 'destructive' : 'secondary'
                            }
                            className={request.status === 'approved' ? 'bg-green-500' : ''}
                          >
                            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(request.requestedAt).toLocaleDateString()}
                          </span>
                        </div>
                        {request.requestMessage && (
                          <p className="text-sm text-muted-foreground mb-2">
                            Request: {request.requestMessage}
                          </p>
                        )}
                        {request.responseMessage && (
                          <p className="text-sm">
                            Response: {request.responseMessage}
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No approval requests yet.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}