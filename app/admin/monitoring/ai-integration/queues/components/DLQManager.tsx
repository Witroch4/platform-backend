"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  RotateCcw, 
  Trash2, 
  AlertTriangle, 
  Eye, 
  RefreshCw,
  Download,
  Upload
} from "lucide-react";

interface DLQJob {
  id: string;
  originalQueue: string;
  jobName: string;
  data: any;
  error: string;
  failedAt: string;
  attempts: number;
  lastError: string;
  canRetry: boolean;
}

interface ReprocessRequest {
  jobIds: string[];
  reason: string;
  requestedBy: string;
}

export default function DLQManager() {
  const [dlqJobs, setDlqJobs] = useState<DLQJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [showReprocessModal, setShowReprocessModal] = useState(false);
  const [reprocessReason, setReprocessReason] = useState("");
  const [queueFilter, setQueueFilter] = useState("all");
  const [selectedJob, setSelectedJob] = useState<DLQJob | null>(null);

  useEffect(() => {
    fetchDLQJobs();
  }, [queueFilter]);

  const fetchDLQJobs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (queueFilter !== "all") {
        params.set("queue", queueFilter);
      }

      const response = await fetch(`/api/admin/ai-integration/queues/dlq?${params}`);
      if (response.ok) {
        const data = await response.json();
        setDlqJobs(data.jobs || []);
      }
    } catch (error) {
      console.error("Error fetching DLQ jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleJobSelection = (jobId: string, selected: boolean) => {
    const newSelection = new Set(selectedJobs);
    if (selected) {
      newSelection.add(jobId);
    } else {
      newSelection.delete(jobId);
    }
    setSelectedJobs(newSelection);
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedJobs(new Set(dlqJobs.map(job => job.id)));
    } else {
      setSelectedJobs(new Set());
    }
  };

  const handleReprocess = async () => {
    if (selectedJobs.size === 0 || !reprocessReason.trim()) {
      alert("Please select jobs and provide a reason for reprocessing");
      return;
    }

    try {
      const response = await fetch("/api/admin/ai-integration/queues/dlq/reprocess", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobIds: Array.from(selectedJobs),
          reason: reprocessReason,
          requestedBy: "admin", // In real implementation, get from session
        }),
      });

      if (response.ok) {
        setShowReprocessModal(false);
        setReprocessReason("");
        setSelectedJobs(new Set());
        await fetchDLQJobs();
        alert("Jobs queued for reprocessing successfully");
      } else {
        const errorData = await response.json();
        alert(errorData.error || "Failed to reprocess jobs");
      }
    } catch (error) {
      console.error("Error reprocessing jobs:", error);
      alert("Error reprocessing jobs");
    }
  };

  const handleDeleteJobs = async () => {
    if (selectedJobs.size === 0) {
      alert("Please select jobs to delete");
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete ${selectedJobs.size} job(s)?`)) {
      return;
    }

    try {
      const response = await fetch("/api/admin/ai-integration/queues/dlq/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobIds: Array.from(selectedJobs),
        }),
      });

      if (response.ok) {
        setSelectedJobs(new Set());
        await fetchDLQJobs();
        alert("Jobs deleted successfully");
      } else {
        alert("Failed to delete jobs");
      }
    } catch (error) {
      console.error("Error deleting jobs:", error);
      alert("Error deleting jobs");
    }
  };

  const handleExportDLQ = async () => {
    try {
      const response = await fetch("/api/admin/ai-integration/queues/dlq/export");
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `dlq-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert("Failed to export DLQ data");
      }
    } catch (error) {
      console.error("Error exporting DLQ:", error);
      alert("Error exporting DLQ data");
    }
  };

  const getErrorSeverity = (error: string) => {
    if (error.includes("timeout") || error.includes("network")) return "warning";
    if (error.includes("validation") || error.includes("schema")) return "error";
    if (error.includes("auth") || error.includes("permission")) return "critical";
    return "error";
  };

  const getSeverityBadge = (severity: string) => {
    const colors = {
      warning: "bg-yellow-100 text-yellow-800",
      error: "bg-red-100 text-red-800",
      critical: "bg-red-200 text-red-900",
    };
    return colors[severity as keyof typeof colors] || "bg-gray-100 text-gray-800";
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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold">Dead Letter Queue</h2>
          <p className="text-gray-600">Manage failed jobs and reprocess them</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleExportDLQ} variant="outline" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button onClick={fetchDLQJobs} variant="outline" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Select value={queueFilter} onValueChange={setQueueFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Queues</SelectItem>
                  <SelectItem value="ai:incoming-message">Incoming Messages</SelectItem>
                  <SelectItem value="ai:embedding-upsert">Embedding Upsert</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedJobs.size === dlqJobs.length && dlqJobs.length > 0}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-gray-600">
                  Select All ({selectedJobs.size} selected)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setShowReprocessModal(true)}
                disabled={selectedJobs.size === 0}
                className="flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Reprocess ({selectedJobs.size})
              </Button>
              <Button
                onClick={handleDeleteJobs}
                disabled={selectedJobs.size === 0}
                variant="destructive"
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete ({selectedJobs.size})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DLQ Jobs */}
      <div className="grid gap-4">
        {dlqJobs.length > 0 ? (
          dlqJobs.map((job) => {
            const severity = getErrorSeverity(job.error);
            return (
              <Card key={job.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedJobs.has(job.id)}
                        onChange={(e) => handleJobSelection(job.id, e.target.checked)}
                        className="rounded"
                      />
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{job.jobName}</span>
                          <Badge className={getSeverityBadge(severity)}>
                            {severity}
                          </Badge>
                          <Badge variant="outline">
                            {job.originalQueue}
                          </Badge>
                          {!job.canRetry && (
                            <Badge variant="destructive">
                              Cannot Retry
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          <span>Failed: {new Date(job.failedAt).toLocaleString()}</span>
                          <span className="ml-4">Attempts: {job.attempts}</span>
                          <span className="ml-4">ID: {job.id.slice(0, 8)}...</span>
                        </div>
                        <p className="text-sm text-red-600 mt-1 truncate max-w-md">
                          {job.lastError}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        
                        onClick={() => setSelectedJob(job)}
                        className="flex items-center gap-1"
                      >
                        <Eye className="h-3 w-3" />
                        Inspect
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card>
            <CardContent className="text-center py-8">
              <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No failed jobs in the Dead Letter Queue</p>
              <p className="text-sm text-gray-400 mt-1">This is a good sign! 🎉</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Reprocess Modal */}
      {showReprocessModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Reprocess Jobs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                You are about to reprocess {selectedJobs.size} job(s). Please provide a reason for this action.
              </p>
              <div>
                <label className="block text-sm font-medium mb-2">Reason for Reprocessing *</label>
                <Textarea
                  value={reprocessReason}
                  onChange={(e) => setReprocessReason(e.target.value)}
                  placeholder="e.g., Fixed API timeout issue, Updated validation rules..."
                  rows={3}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowReprocessModal(false);
                    setReprocessReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleReprocess} disabled={!reprocessReason.trim()}>
                  Reprocess Jobs
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Job Details Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Failed Job Details: {selectedJob.jobName}</CardTitle>
              <Button variant="ghost"  onClick={() => setSelectedJob(null)}>
                ×
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Job Information</h4>
                  <div className="space-y-1 text-sm">
                    <p><strong>ID:</strong> {selectedJob.id}</p>
                    <p><strong>Original Queue:</strong> {selectedJob.originalQueue}</p>
                    <p><strong>Job Name:</strong> {selectedJob.jobName}</p>
                    <p><strong>Attempts:</strong> {selectedJob.attempts}</p>
                    <p><strong>Can Retry:</strong> {selectedJob.canRetry ? "Yes" : "No"}</p>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Failure Information</h4>
                  <div className="space-y-1 text-sm">
                    <p><strong>Failed At:</strong> {new Date(selectedJob.failedAt).toLocaleString()}</p>
                    <p><strong>Severity:</strong> {getErrorSeverity(selectedJob.error)}</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Job Data</h4>
                <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto max-h-64">
                  {JSON.stringify(selectedJob.data, null, 2)}
                </pre>
              </div>

              <div>
                <h4 className="font-medium mb-2 text-red-600">Error Details</h4>
                <pre className="bg-red-50 border border-red-200 p-3 rounded text-sm overflow-x-auto max-h-64 text-red-800">
                  {selectedJob.error}
                </pre>
              </div>

              {selectedJob.lastError !== selectedJob.error && (
                <div>
                  <h4 className="font-medium mb-2 text-red-600">Last Error</h4>
                  <pre className="bg-red-50 border border-red-200 p-3 rounded text-sm overflow-x-auto max-h-32 text-red-800">
                    {selectedJob.lastError}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}