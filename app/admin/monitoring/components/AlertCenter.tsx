'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  BellOff, 
  Check, 
  CheckCircle, 
  Clock, 
  Filter, 
  Info, 
  RefreshCw, 
  Search, 
  X, 
  XCircle 
} from 'lucide-react';
import { Alert, AlertSeverity } from '@/types/queue-management';
import { useRealTimeAlerts } from './WebSocketProvider';

interface AlertCenterProps {
  alerts: Alert[];
  onAcknowledgeAlert: (alertId: string, note?: string) => void;
  onResolveAlert: (alertId: string, note?: string) => void;
  onDismissAlert: (alertId: string) => void;
  onRefresh: () => void;
  realTimeUpdates?: boolean;
  onToggleRealTime?: () => void;
}

export function AlertCenter({ 
  alerts, 
  onAcknowledgeAlert, 
  onResolveAlert, 
  onDismissAlert, 
  onRefresh,
  realTimeUpdates = true,
  onToggleRealTime
}: AlertCenterProps) {
  // Use real-time alerts if WebSocket is available
  const { alerts: realtimeAlerts, connected: wsConnected } = useRealTimeAlerts();
  
  // Merge real-time alerts with props alerts (real-time takes precedence)
  const allAlerts = wsConnected && realtimeAlerts.length > 0 ? realtimeAlerts : alerts;
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'acknowledged' | 'resolved'>('all');
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [acknowledgeNote, setAcknowledgeNote] = useState('');
  const [resolveNote, setResolveNote] = useState('');
  const [showAcknowledgeDialog, setShowAcknowledgeDialog] = useState(false);
  const [showResolveDialog, setShowResolveDialog] = useState(false);

  // Filter alerts based on search and filters
  const filteredAlerts = allAlerts.filter(alert => {
    // Search filter
    if (searchTerm && !alert.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !alert.message.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !alert.queueName?.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    
    // Severity filter
    if (severityFilter !== 'all' && alert.severity !== severityFilter) {
      return false;
    }
    
    // Status filter
    if (statusFilter !== 'all' && alert.status !== statusFilter) {
      return false;
    }
    
    return true;
  });

  // Group alerts by severity
  const alertsBySeverity = {
    critical: filteredAlerts.filter(a => a.severity === 'critical'),
    error: filteredAlerts.filter(a => a.severity === 'error'),
    warning: filteredAlerts.filter(a => a.severity === 'warning'),
    info: filteredAlerts.filter(a => a.severity === 'info')
  };

  // Alert statistics
  const alertStats = {
    total: allAlerts.length,
    active: allAlerts.filter(a => a.status === 'active').length,
    acknowledged: allAlerts.filter(a => a.status === 'acknowledged').length,
    resolved: allAlerts.filter(a => a.status === 'resolved').length,
    critical: allAlerts.filter(a => a.severity === 'critical' && a.status === 'active').length
  };

  const getSeverityIcon = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical': return <XCircle className="h-4 w-4 text-red-600" />;
      case 'error': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'info': return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityColor = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical': return 'border-red-500 bg-red-50';
      case 'error': return 'border-red-400 bg-red-50';
      case 'warning': return 'border-yellow-400 bg-yellow-50';
      case 'info': return 'border-blue-400 bg-blue-50';
    }
  };

  const getSeverityBadgeVariant = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical': return 'destructive' as const;
      case 'error': return 'destructive' as const;
      case 'warning': return 'secondary' as const;
      case 'info': return 'default' as const;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <Bell className="h-4 w-4 text-red-600" />;
      case 'acknowledged': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'resolved': return <CheckCircle className="h-4 w-4 text-green-600" />;
      default: return <Bell className="h-4 w-4 text-gray-600" />;
    }
  };

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const handleAcknowledge = (alert: Alert) => {
    setSelectedAlert(alert);
    setAcknowledgeNote('');
    setShowAcknowledgeDialog(true);
  };

  const handleResolve = (alert: Alert) => {
    setSelectedAlert(alert);
    setResolveNote('');
    setShowResolveDialog(true);
  };

  const confirmAcknowledge = () => {
    if (selectedAlert) {
      onAcknowledgeAlert(selectedAlert.id, acknowledgeNote || undefined);
      setShowAcknowledgeDialog(false);
      setSelectedAlert(null);
      setAcknowledgeNote('');
    }
  };

  const confirmResolve = () => {
    if (selectedAlert) {
      onResolveAlert(selectedAlert.id, resolveNote || undefined);
      setShowResolveDialog(false);
      setSelectedAlert(null);
      setResolveNote('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Alert Center</h1>
          <p className="text-muted-foreground">
            Monitor and manage system alerts and notifications
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {onToggleRealTime && (
            <Button
              variant="outline"
              
              onClick={onToggleRealTime}
              className={realTimeUpdates ? 'bg-green-50 border-green-200' : ''}
            >
              {realTimeUpdates ? <Bell className="h-4 w-4 mr-2" /> : <BellOff className="h-4 w-4 mr-2" />}
              Real-time: {realTimeUpdates ? 'ON' : 'OFF'}
            </Button>
          )}
          
          {/* WebSocket Connection Status */}
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-muted-foreground">
              WebSocket: {wsConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <Button variant="outline"  onClick={onRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          
          {/* Test Alert Button */}
          <Button 
            variant="outline" 
             
            onClick={async () => {
              try {
                await fetch('/api/admin/queue-management/alerts/test', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    type: 'demo', 
                    severity: Math.random() > 0.5 ? 'warning' : 'error',
                    queueName: 'demo-queue'
                  })
                });
              } catch (error) {
                console.error('Failed to create test alert:', error);
              }
            }}
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Test Alert
          </Button>
        </div>
      </div>

      {/* Alert Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alertStats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{alertStats.active}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">Acknowledged</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{alertStats.acknowledged}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{alertStats.resolved}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-700">Critical</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{alertStats.critical}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Alerts ({filteredAlerts.length})</CardTitle>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search alerts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
              
              <Select value={severityFilter} onValueChange={(value: any) => setSeverityFilter(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Critical Alerts Section */}
      {alertsBySeverity.critical.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center text-red-800">
              <XCircle className="h-5 w-5 mr-2" />
              Critical Alerts ({alertsBySeverity.critical.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alertsBySeverity.critical.slice(0, 3).map((alert) => (
                <div
                  key={alert.id}
                  className="p-4 bg-white border border-red-200 rounded-lg"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        {getSeverityIcon(alert.severity)}
                        <h4 className="font-semibold text-red-800">{alert.title}</h4>
                        {alert.queueName && (
                          <Badge variant="outline">{alert.queueName}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-red-700 mb-2">{alert.message}</p>
                      <div className="flex items-center space-x-4 text-xs text-red-600">
                        <span>{formatRelativeTime(alert.createdAt)}</span>
                        {getStatusIcon(alert.status)}
                        <span className="capitalize">{alert.status}</span>
                      </div>
                    </div>
                    
                    <div className="flex space-x-2 ml-4">
                      {alert.status === 'active' && (
                        <Button
                          variant="outline"
                          
                          onClick={() => handleAcknowledge(alert)}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Acknowledge
                        </Button>
                      )}
                      {alert.status === 'acknowledged' && (
                        <Button
                          variant="outline"
                          
                          onClick={() => handleResolve(alert)}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Resolve
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        
                        onClick={() => onDismissAlert(alert.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Alerts List */}
      <Card>
        <CardContent className="p-0">
          <div className="space-y-1">
            {filteredAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 border-l-4 hover:bg-gray-50 ${getSeverityColor(alert.severity)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      {getSeverityIcon(alert.severity)}
                      <h4 className="font-semibold">{alert.title}</h4>
                      <Badge variant={getSeverityBadgeVariant(alert.severity)}>
                        {alert.severity}
                      </Badge>
                      {alert.queueName && (
                        <Badge variant="outline">{alert.queueName}</Badge>
                      )}
                    </div>
                    
                    <p className="text-sm text-gray-700 mb-2">{alert.message}</p>
                    
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span>{formatRelativeTime(alert.createdAt)}</span>
                      <div className="flex items-center space-x-1">
                        {getStatusIcon(alert.status)}
                        <span className="capitalize">{alert.status}</span>
                      </div>
                      {alert.acknowledgedAt && (
                        <span>Ack: {formatRelativeTime(alert.acknowledgedAt)}</span>
                      )}
                      {alert.resolvedAt && (
                        <span>Resolved: {formatRelativeTime(alert.resolvedAt)}</span>
                      )}
                    </div>
                    
                    {/* Metrics */}
                    {alert.metrics && Object.keys(alert.metrics).length > 0 && (
                      <div className="mt-2 text-xs">
                        <span className="font-medium">Metrics: </span>
                        {Object.entries(alert.metrics).map(([key, value]) => (
                          <span key={key} className="mr-3">
                            {key}: {typeof value === 'number' ? value.toFixed(2) : value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex space-x-2 ml-4">
                    {alert.status === 'active' && (
                      <Button
                        variant="outline"
                        
                        onClick={() => handleAcknowledge(alert)}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Acknowledge
                      </Button>
                    )}
                    {alert.status === 'acknowledged' && (
                      <Button
                        variant="outline"
                        
                        onClick={() => handleResolve(alert)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Resolve
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      
                      onClick={() => onDismissAlert(alert.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            
            {filteredAlerts.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No alerts found</h3>
                <p>
                  {searchTerm || severityFilter !== 'all' || statusFilter !== 'all' ? 
                    'No alerts match your current filters.' :
                    'All systems are running smoothly.'
                  }
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Acknowledge Dialog */}
      <Dialog open={showAcknowledgeDialog} onOpenChange={setShowAcknowledgeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acknowledge Alert</DialogTitle>
            <DialogDescription>
              Acknowledge this alert to indicate you are aware of the issue.
            </DialogDescription>
          </DialogHeader>
          
          {selectedAlert && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <h4 className="font-medium">{selectedAlert.title}</h4>
                <p className="text-sm text-muted-foreground">{selectedAlert.message}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium">Note (optional)</label>
                <Textarea
                  value={acknowledgeNote}
                  onChange={(e) => setAcknowledgeNote(e.target.value)}
                  placeholder="Add a note about this acknowledgment..."
                  className="mt-1"
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAcknowledgeDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmAcknowledge}>
              <Check className="h-4 w-4 mr-2" />
              Acknowledge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Alert</DialogTitle>
            <DialogDescription>
              Mark this alert as resolved once the issue has been fixed.
            </DialogDescription>
          </DialogHeader>
          
          {selectedAlert && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <h4 className="font-medium">{selectedAlert.title}</h4>
                <p className="text-sm text-muted-foreground">{selectedAlert.message}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium">Resolution Note</label>
                <Textarea
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  placeholder="Describe how this issue was resolved..."
                  className="mt-1"
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmResolve}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}