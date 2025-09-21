"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  Eye, 
  RotateCcw, 
  Trash2, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  RefreshCw
} from "lucide-react";

interface Job {
  id: string;
  name: string;
  queueName: string;
  status: "waiting" | "active" | "completed" | "failed" | "delayed";
  data: any;
  progress: number;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  processedAt?: string;
  finishedAt?: string;
  error?: string;
  returnValue?: any;
  delay?: number;
}

interface JobInspectorProps {
  selectedQueue?: string | null;
}

export default function JobInspector({ selectedQueue }: JobInspectorProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [queueFilter, setQueueFilter] = useState(selectedQueue || "all");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (selectedQueue) {
      setQueueFilter(selectedQueue);
    }
  }, [selectedQueue]);

  useEffect(() => {
    fetchJobs();
  }, [searchTerm, statusFilter, queueFilter, page]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        search: searchTerm,
        status: statusFilter,
        queue: queueFilter,
      });

      const response = await fetch(`/api/admin/ai-integration/queues/jobs?${params}`);
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
        setTotalPages(data.totalPages || 1);
      }
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleJobAction = async (jobId: string, action: "retry" | "remove") => {
    try {
      const response = await fetch(`/api/admin/ai-integration/queues/jobs/${jobId}/${action}`, {
        method: "POST",
      });

      if (response.ok) {
        await fetchJobs();
        if (selectedJob?.id === jobId) {
          setSelectedJob(null);
        }
      } else {
        alert(`Failed to ${action} job`);
      }
    } catch (error) {
      console.error(`Error ${action}ing job:`, error);
      alert(`Error ${action}ing job`);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      waiting: "bg-blue-100 text-blue-800",
      active: "bg-yellow-100 text-yellow-800",
      completed: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
      delayed: "bg-purple-100 text-purple-800",
    };
    return colors[status as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "active":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case "delayed":
        return <AlertTriangle className="h-4 w-4 text-purple-600" />;
      default:
        return <Clock className="h-4 w-4 text-blue-600" />;
    }
  };

  const formatDuration = (start: string, end?: string) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const duration = endTime - startTime;
    
    if (duration < 1000) return `${duration}ms`;
    if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
    return `${(duration / 60000).toFixed(1)}m`;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Job Inspector</h2>
        <Button onClick={fetchJobs} variant="outline" className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search jobs by ID, name, or data..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="waiting">Waiting</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="delayed">Delayed</SelectItem>
              </SelectContent>
            </Select>
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
          </div>
        </CardContent>
      </Card>

      {/* Jobs List */}
      <div className="grid gap-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        ) : jobs.length > 0 ? (
          jobs.map((job) => (
            <Card key={job.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(job.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{job.name}</span>
                        <Badge className={getStatusBadge(job.status)}>
                          {job.status}
                        </Badge>
                        {job.progress > 0 && job.progress < 100 && (
                          <Badge variant="outline">{job.progress}%</Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        <span>ID: {job.id.slice(0, 8)}...</span>
                        <span className="ml-4">Queue: {job.queueName}</span>
                        <span className="ml-4">
                          Attempts: {job.attempts}/{job.maxAttempts}
                        </span>
                        {job.processedAt && (
                          <span className="ml-4">
                            Duration: {formatDuration(job.createdAt, job.finishedAt)}
                          </span>
                        )}
                      </div>
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
                    {job.status === "failed" && (
                      <Button
                        variant="outline"
                        
                        onClick={() => handleJobAction(job.id, "retry")}
                        className="flex items-center gap-1 text-blue-600"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Retry
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      
                      onClick={() => handleJobAction(job.id, "remove")}
                      className="flex items-center gap-1 text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-gray-500">No jobs found matching the current filters</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      )}

      {/* Job Details Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Job Details: {selectedJob.name}</CardTitle>
              <Button variant="ghost"  onClick={() => setSelectedJob(null)}>
                ×
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Basic Information</h4>
                  <div className="space-y-1 text-sm">
                    <p><strong>ID:</strong> {selectedJob.id}</p>
                    <p><strong>Queue:</strong> {selectedJob.queueName}</p>
                    <p><strong>Status:</strong> {selectedJob.status}</p>
                    <p><strong>Progress:</strong> {selectedJob.progress}%</p>
                    <p><strong>Attempts:</strong> {selectedJob.attempts}/{selectedJob.maxAttempts}</p>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Timestamps</h4>
                  <div className="space-y-1 text-sm">
                    <p><strong>Created:</strong> {new Date(selectedJob.createdAt).toLocaleString()}</p>
                    {selectedJob.processedAt && (
                      <p><strong>Processed:</strong> {new Date(selectedJob.processedAt).toLocaleString()}</p>
                    )}
                    {selectedJob.finishedAt && (
                      <p><strong>Finished:</strong> {new Date(selectedJob.finishedAt).toLocaleString()}</p>
                    )}
                    {selectedJob.delay && (
                      <p><strong>Delay:</strong> {selectedJob.delay}ms</p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Job Data</h4>
                <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                  {JSON.stringify(selectedJob.data, null, 2)}
                </pre>
              </div>

              {selectedJob.error && (
                <div>
                  <h4 className="font-medium mb-2 text-red-600">Error</h4>
                  <pre className="bg-red-50 border border-red-200 p-3 rounded text-sm overflow-x-auto text-red-800">
                    {selectedJob.error}
                  </pre>
                </div>
              )}

              {selectedJob.returnValue && (
                <div>
                  <h4 className="font-medium mb-2 text-green-600">Return Value</h4>
                  <pre className="bg-green-50 border border-green-200 p-3 rounded text-sm overflow-x-auto">
                    {JSON.stringify(selectedJob.returnValue, null, 2)}
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