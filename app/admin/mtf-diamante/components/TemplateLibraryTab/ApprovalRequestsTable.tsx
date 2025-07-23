'use client';

import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, Eye, Clock } from 'lucide-react';
import type { ApprovalRequestWithDetails } from '@/hooks/useApprovalRequests';

interface ApprovalRequestsTableProps {
  requests: ApprovalRequestWithDetails[];
  loading: boolean;
  onProcessRequest: (requestId: string, status: 'approved' | 'rejected', responseMessage?: string) => Promise<void>;
}

export function ApprovalRequestsTable({ requests, loading, onProcessRequest }: ApprovalRequestsTableProps) {
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequestWithDetails | null>(null);
  const [processingStatus, setProcessingStatus] = useState<'approved' | 'rejected' | null>(null);
  const [responseMessage, setResponseMessage] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleProcessRequest = async () => {
    if (!selectedRequest || !processingStatus) return;

    setProcessing(true);
    try {
      await onProcessRequest(selectedRequest.id, processingStatus, responseMessage);
      setSelectedRequest(null);
      setProcessingStatus(null);
      setResponseMessage('');
    } catch (error) {
      console.error('Error processing request:', error);
    } finally {
      setProcessing(false);
    }
  };

  const openProcessDialog = (request: ApprovalRequestWithDetails, status: 'approved' | 'rejected') => {
    setSelectedRequest(request);
    setProcessingStatus(status);
    setResponseMessage('');
  };

  if (loading) {
    return <div className="text-center py-8">Loading approval requests...</div>;
  }

  if (requests.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Approval Requests</CardTitle>
          <CardDescription>No pending approval requests at this time.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Approval Requests</CardTitle>
          <CardDescription>
            Review and process template approval requests from users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead>Request Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{request.templateLibrary.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {request.templateLibrary.type.replace('_', ' ')} • {request.templateLibrary.scope}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{request.requestedBy.name || 'Unknown'}</div>
                      <div className="text-sm text-muted-foreground">{request.requestedBy.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {new Date(request.requestedAt).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={
                        request.status === 'approved' ? 'default' :
                        request.status === 'rejected' ? 'destructive' : 'secondary'
                      }
                      className={request.status === 'approved' ? 'bg-green-500' : ''}
                    >
                      {request.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                      {request.status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                      {request.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                      {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedRequest(request)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      {request.status === 'pending' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openProcessDialog(request, 'approved')}
                            className="text-green-600 border-green-200 hover:bg-green-50"
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openProcessDialog(request, 'rejected')}
                            className="text-red-600 border-red-200 hover:bg-red-50"
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* View Request Dialog */}
      <Dialog 
        open={!!selectedRequest && !processingStatus} 
        onOpenChange={(open) => !open && setSelectedRequest(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Approval Request Details</DialogTitle>
            <DialogDescription>
              Review the template approval request details.
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Template Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name:</span>
                    <span>{selectedRequest.templateLibrary.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="capitalize">{selectedRequest.templateLibrary.type.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Scope:</span>
                    <span className="capitalize">{selectedRequest.templateLibrary.scope.replace('_', ' ')}</span>
                  </div>
                  {selectedRequest.templateLibrary.description && (
                    <div>
                      <span className="text-muted-foreground">Description:</span>
                      <p className="mt-1">{selectedRequest.templateLibrary.description}</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Request Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Requested by:</span>
                    <span>{selectedRequest.requestedBy.name || selectedRequest.requestedBy.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Request date:</span>
                    <span>{new Date(selectedRequest.requestedAt).toLocaleString()}</span>
                  </div>
                  {selectedRequest.requestMessage && (
                    <div>
                      <span className="text-muted-foreground">Message:</span>
                      <p className="mt-1 p-2 bg-muted rounded">{selectedRequest.requestMessage}</p>
                    </div>
                  )}
                </div>
              </div>

              {selectedRequest.customVariables && (
                <div>
                  <h4 className="font-medium mb-2">Custom Variables</h4>
                  <div className="p-2 bg-muted rounded text-sm font-mono">
                    <pre>{JSON.stringify(selectedRequest.customVariables, null, 2)}</pre>
                  </div>
                </div>
              )}

              {selectedRequest.status !== 'pending' && (
                <div>
                  <h4 className="font-medium mb-2">Processing Information</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge 
                        variant={selectedRequest.status === 'approved' ? 'default' : 'destructive'}
                        className={selectedRequest.status === 'approved' ? 'bg-green-500' : ''}
                      >
                        {selectedRequest.status.charAt(0).toUpperCase() + selectedRequest.status.slice(1)}
                      </Badge>
                    </div>
                    {selectedRequest.processedAt && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Processed at:</span>
                        <span>{new Date(selectedRequest.processedAt).toLocaleString()}</span>
                      </div>
                    )}
                    {selectedRequest.processedBy && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Processed by:</span>
                        <span>{selectedRequest.processedBy.name || selectedRequest.processedBy.email}</span>
                      </div>
                    )}
                    {selectedRequest.responseMessage && (
                      <div>
                        <span className="text-muted-foreground">Response:</span>
                        <p className="mt-1 p-2 bg-muted rounded">{selectedRequest.responseMessage}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Process Request Dialog */}
      <Dialog 
        open={!!selectedRequest && !!processingStatus} 
        onOpenChange={(open) => {
          if (!open) {
            setProcessingStatus(null);
            setResponseMessage('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {processingStatus === 'approved' ? 'Approve' : 'Reject'} Template Request
            </DialogTitle>
            <DialogDescription>
              {processingStatus === 'approved' 
                ? 'Approve this template for the user\'s account.' 
                : 'Reject this template request with a reason.'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="response">Response Message {processingStatus === 'rejected' && '(Required)'}</Label>
              <Textarea
                id="response"
                value={responseMessage}
                onChange={(e) => setResponseMessage(e.target.value)}
                placeholder={
                  processingStatus === 'approved' 
                    ? 'Optional message to the user...' 
                    : 'Please provide a reason for rejection...'
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setProcessingStatus(null);
                setResponseMessage('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleProcessRequest}
              disabled={processing || (processingStatus === 'rejected' && !responseMessage.trim())}
              variant={processingStatus === 'approved' ? 'default' : 'destructive'}
            >
              {processing ? 'Processing...' : (processingStatus === 'approved' ? 'Approve' : 'Reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}