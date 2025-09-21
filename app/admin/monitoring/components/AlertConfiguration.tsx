'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  AlertTriangle, 
  Bell, 
  Edit, 
  Info, 
  Plus, 
  Settings, 
  Trash2, 
  XCircle 
} from 'lucide-react';

interface AlertRule {
  id?: string;
  name: string;
  description: string;
  queueName?: string; // null = global
  condition: AlertCondition;
  severity: 'info' | 'warning' | 'error' | 'critical';
  channels: NotificationChannel[];
  cooldown: number; // minutes
  enabled: boolean;
  createdBy: string;
}

interface AlertCondition {
  metric: string;
  operator: '>' | '<' | '==' | '!=' | 'contains';
  threshold: number | string;
  timeWindow: number; // minutes
  aggregation?: 'avg' | 'sum' | 'max' | 'min' | 'count';
}

interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook' | 'sms';
  config: Record<string, any>;
}

interface AlertConfigurationProps {
  alertRules: AlertRule[];
  queueNames: string[];
  onCreateRule: (rule: Omit<AlertRule, 'id'>) => void;
  onUpdateRule: (id: string, rule: Partial<AlertRule>) => void;
  onDeleteRule: (id: string) => void;
  onTestRule: (rule: AlertRule) => void;
}

export function AlertConfiguration({ 
  alertRules, 
  queueNames, 
  onCreateRule, 
  onUpdateRule, 
  onDeleteRule, 
  onTestRule 
}: AlertConfigurationProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [formData, setFormData] = useState<Partial<AlertRule>>({
    name: '',
    description: '',
    queueName: undefined,
    condition: {
      metric: 'throughput',
      operator: '>',
      threshold: 100,
      timeWindow: 5,
      aggregation: 'avg'
    },
    severity: 'warning',
    channels: [],
    cooldown: 5,
    enabled: true,
    createdBy: 'current-user'
  });

  const availableMetrics = [
    { value: 'throughput', label: 'Throughput (jobs/min)' },
    { value: 'latency_p50', label: 'P50 Latency (ms)' },
    { value: 'latency_p95', label: 'P95 Latency (ms)' },
    { value: 'latency_p99', label: 'P99 Latency (ms)' },
    { value: 'success_rate', label: 'Success Rate (%)' },
    { value: 'error_rate', label: 'Error Rate (%)' },
    { value: 'waiting_jobs', label: 'Waiting Jobs Count' },
    { value: 'active_jobs', label: 'Active Jobs Count' },
    { value: 'failed_jobs', label: 'Failed Jobs Count' },
    { value: 'memory_usage', label: 'Memory Usage (MB)' },
    { value: 'cpu_usage', label: 'CPU Usage (%)' }
  ];

  const channelTypes = [
    { value: 'email', label: 'Email' },
    { value: 'slack', label: 'Slack' },
    { value: 'webhook', label: 'Webhook' },
    { value: 'sms', label: 'SMS' }
  ];

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle className="h-4 w-4 text-red-600" />;
      case 'error': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'info': return <Info className="h-4 w-4 text-blue-500" />;
      default: return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  const getSeverityBadgeVariant = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive' as const;
      case 'error': return 'destructive' as const;
      case 'warning': return 'secondary' as const;
      case 'info': return 'default' as const;
      default: return 'outline' as const;
    }
  };

  const handleCreateRule = () => {
    setFormData({
      name: '',
      description: '',
      queueName: undefined,
      condition: {
        metric: 'throughput',
        operator: '>',
        threshold: 100,
        timeWindow: 5,
        aggregation: 'avg'
      },
      severity: 'warning',
      channels: [],
      cooldown: 5,
      enabled: true,
      createdBy: 'current-user'
    });
    setShowCreateDialog(true);
  };

  const handleEditRule = (rule: AlertRule) => {
    setEditingRule(rule);
    setFormData(rule);
    setShowEditDialog(true);
  };

  const handleSaveRule = () => {
    if (editingRule) {
      onUpdateRule(editingRule.id!, formData);
      setShowEditDialog(false);
    } else {
      onCreateRule(formData as Omit<AlertRule, 'id'>);
      setShowCreateDialog(false);
    }
    setEditingRule(null);
  };

  const handleAddChannel = () => {
    const newChannel: NotificationChannel = {
      type: 'email',
      config: { recipients: [] }
    };
    setFormData(prev => ({
      ...prev,
      channels: [...(prev.channels || []), newChannel]
    }));
  };

  const handleUpdateChannel = (index: number, channel: NotificationChannel) => {
    setFormData(prev => ({
      ...prev,
      channels: prev.channels?.map((c, i) => i === index ? channel : c) || []
    }));
  };

  const handleRemoveChannel = (index: number) => {
    setFormData(prev => ({
      ...prev,
      channels: prev.channels?.filter((_, i) => i !== index) || []
    }));
  };

  const renderChannelConfig = (channel: NotificationChannel, index: number) => {
    switch (channel.type) {
      case 'email':
        return (
          <div className="space-y-2">
            <Input
              placeholder="Recipients (comma-separated)"
              value={channel.config.recipients?.join(', ') || ''}
              onChange={(e) => handleUpdateChannel(index, {
                ...channel,
                config: { ...channel.config, recipients: e.target.value.split(',').map(s => s.trim()) }
              })}
            />
          </div>
        );
      
      case 'slack':
        return (
          <div className="space-y-2">
            <Input
              placeholder="Webhook URL"
              value={channel.config.webhookUrl || ''}
              onChange={(e) => handleUpdateChannel(index, {
                ...channel,
                config: { ...channel.config, webhookUrl: e.target.value }
              })}
            />
            <Input
              placeholder="Channel (optional)"
              value={channel.config.channel || ''}
              onChange={(e) => handleUpdateChannel(index, {
                ...channel,
                config: { ...channel.config, channel: e.target.value }
              })}
            />
          </div>
        );
      
      case 'webhook':
        return (
          <div className="space-y-2">
            <Input
              placeholder="Webhook URL"
              value={channel.config.url || ''}
              onChange={(e) => handleUpdateChannel(index, {
                ...channel,
                config: { ...channel.config, url: e.target.value }
              })}
            />
            <Input
              placeholder="Headers (JSON)"
              value={channel.config.headers || ''}
              onChange={(e) => handleUpdateChannel(index, {
                ...channel,
                config: { ...channel.config, headers: e.target.value }
              })}
            />
          </div>
        );
      
      case 'sms':
        return (
          <div className="space-y-2">
            <Input
              placeholder="Phone numbers (comma-separated)"
              value={channel.config.phoneNumbers?.join(', ') || ''}
              onChange={(e) => handleUpdateChannel(index, {
                ...channel,
                config: { ...channel.config, phoneNumbers: e.target.value.split(',').map(s => s.trim()) }
              })}
            />
          </div>
        );
      
      default:
        return null;
    }
  };

  const RuleForm = () => (
    <div className="space-y-4">
      {/* Basic Information */}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Rule Name</label>
          <Input
            value={formData.name || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Enter rule name"
          />
        </div>
        
        <div>
          <label className="text-sm font-medium">Description</label>
          <Textarea
            value={formData.description || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Describe what this rule monitors"
          />
        </div>
        
        <div>
          <label className="text-sm font-medium">Queue</label>
          <Select
            value={formData.queueName || 'global'}
            onValueChange={(value) => setFormData(prev => ({ 
              ...prev, 
              queueName: value === 'global' ? undefined : value 
            }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">All Queues (Global)</SelectItem>
              {queueNames.map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Condition */}
      <div className="space-y-4">
        <h4 className="font-medium">Alert Condition</h4>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Metric</label>
            <Select
              value={formData.condition?.metric || 'throughput'}
              onValueChange={(value) => setFormData(prev => ({
                ...prev,
                condition: { ...prev.condition!, metric: value }
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableMetrics.map(metric => (
                  <SelectItem key={metric.value} value={metric.value}>
                    {metric.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="text-sm font-medium">Operator</label>
            <Select
              value={formData.condition?.operator || '>'}
              onValueChange={(value: any) => setFormData(prev => ({
                ...prev,
                condition: { ...prev.condition!, operator: value }
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=">">Greater than</SelectItem>
                <SelectItem value="<">Less than</SelectItem>
                <SelectItem value="==">Equal to</SelectItem>
                <SelectItem value="!=">Not equal to</SelectItem>
                <SelectItem value="contains">Contains</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Threshold</label>
            <Input
              type="number"
              value={formData.condition?.threshold || 0}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                condition: { ...prev.condition!, threshold: parseFloat(e.target.value) }
              }))}
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Time Window (minutes)</label>
            <Input
              type="number"
              value={formData.condition?.timeWindow || 5}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                condition: { ...prev.condition!, timeWindow: parseInt(e.target.value) }
              }))}
            />
          </div>
        </div>
        
        <div>
          <label className="text-sm font-medium">Aggregation</label>
          <Select
            value={formData.condition?.aggregation || 'avg'}
            onValueChange={(value: any) => setFormData(prev => ({
              ...prev,
              condition: { ...prev.condition!, aggregation: value }
            }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="avg">Average</SelectItem>
              <SelectItem value="sum">Sum</SelectItem>
              <SelectItem value="max">Maximum</SelectItem>
              <SelectItem value="min">Minimum</SelectItem>
              <SelectItem value="count">Count</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Severity and Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Severity</label>
          <Select
            value={formData.severity || 'warning'}
            onValueChange={(value: any) => setFormData(prev => ({ ...prev, severity: value }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <label className="text-sm font-medium">Cooldown (minutes)</label>
          <Input
            type="number"
            value={formData.cooldown || 5}
            onChange={(e) => setFormData(prev => ({ ...prev, cooldown: parseInt(e.target.value) }))}
          />
        </div>
      </div>

      {/* Notification Channels */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Notification Channels</h4>
          <Button variant="outline"  onClick={handleAddChannel}>
            <Plus className="h-4 w-4 mr-2" />
            Add Channel
          </Button>
        </div>
        
        {formData.channels?.map((channel, index) => (
          <div key={index} className="p-4 border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <Select
                value={channel.type}
                onValueChange={(value: any) => handleUpdateChannel(index, { ...channel, type: value })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {channelTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button
                variant="outline"
                
                onClick={() => handleRemoveChannel(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            
            {renderChannelConfig(channel, index)}
          </div>
        ))}
      </div>

      {/* Enable/Disable */}
      <div className="flex items-center space-x-2">
        <Switch
          checked={formData.enabled || false}
          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, enabled: checked }))}
        />
        <label className="text-sm font-medium">Enable this rule</label>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Alert Configuration</h1>
          <p className="text-muted-foreground">
            Configure alert rules and notification channels
          </p>
        </div>
        <Button onClick={handleCreateRule}>
          <Plus className="h-4 w-4 mr-2" />
          Create Rule
        </Button>
      </div>

      {/* Alert Rules List */}
      <div className="space-y-4">
        {alertRules.map((rule) => (
          <Card key={rule.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getSeverityIcon(rule.severity)}
                  <div>
                    <CardTitle className="text-lg">{rule.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{rule.description}</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Badge variant={getSeverityBadgeVariant(rule.severity)}>
                    {rule.severity}
                  </Badge>
                  {rule.queueName && (
                    <Badge variant="outline">{rule.queueName}</Badge>
                  )}
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(checked) => onUpdateRule(rule.id!, { enabled: checked })}
                  />
                </div>
              </div>
            </CardHeader>
            
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div>
                  <span className="text-sm text-muted-foreground">Metric:</span>
                  <p className="font-medium">{rule.condition.metric}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Condition:</span>
                  <p className="font-medium">
                    {rule.condition.operator} {rule.condition.threshold}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Time Window:</span>
                  <p className="font-medium">{rule.condition.timeWindow}m</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Cooldown:</span>
                  <p className="font-medium">{rule.cooldown}m</p>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-muted-foreground">Channels:</span>
                  {rule.channels.map((channel, index) => (
                    <Badge key={index} variant="outline">
                      {channel.type}
                    </Badge>
                  ))}
                </div>
                
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    
                    onClick={() => onTestRule(rule)}
                  >
                    Test
                  </Button>
                  <Button
                    variant="outline"
                    
                    onClick={() => handleEditRule(rule)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    
                    onClick={() => onDeleteRule(rule.id!)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {alertRules.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <Settings className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No alert rules configured</h3>
              <p className="text-muted-foreground mb-4">
                Create your first alert rule to start monitoring your queues.
              </p>
              <Button onClick={handleCreateRule}>
                <Plus className="h-4 w-4 mr-2" />
                Create Alert Rule
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create Rule Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Alert Rule</DialogTitle>
            <DialogDescription>
              Configure a new alert rule to monitor your queues.
            </DialogDescription>
          </DialogHeader>
          
          <RuleForm />
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRule}>
              Create Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Rule Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Alert Rule</DialogTitle>
            <DialogDescription>
              Modify the alert rule configuration.
            </DialogDescription>
          </DialogHeader>
          
          <RuleForm />
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRule}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}