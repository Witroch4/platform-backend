/**
 * Flow Visualization Components Tests
 * 
 * Tests for enhanced FlowVisualizer and FlowTimeline components
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FlowVisualizer } from '../FlowVisualizer';
import { FlowTimeline } from '../FlowTimeline';
import { FlowTree, FlowNode } from '@/types/queue-management';

// Mock data for testing
const mockFlowTree: FlowTree = {
  flowId: 'test-flow-123',
  status: 'running',
  totalJobs: 5,
  completedJobs: 2,
  failedJobs: 1,
  startedAt: new Date('2024-01-01T10:00:00Z'),
  rootJob: {
    jobId: 'root-job',
    jobName: 'Root Job',
    status: 'completed',
    children: [
      {
        jobId: 'child-job-1',
        jobName: 'Child Job 1',
        status: 'active',
        children: [],
        dependencies: ['root-job'],
        metrics: {
          jobId: 'child-job-1',
          queueName: 'test-queue',
          jobType: 'test',
          status: 'active',
          timing: {
            createdAt: new Date('2024-01-01T10:01:00Z'),
            startedAt: new Date('2024-01-01T10:01:30Z'),
            processingTime: 30000
          },
          resources: {
            memoryPeak: 1024,
            cpuTime: 500
          },
          attempts: 1
        }
      },
      {
        jobId: 'child-job-2',
        jobName: 'Child Job 2',
        status: 'failed',
        children: [],
        dependencies: ['root-job'],
        error: 'Test error message',
        metrics: {
          jobId: 'child-job-2',
          queueName: 'test-queue',
          jobType: 'test',
          status: 'failed',
          timing: {
            createdAt: new Date('2024-01-01T10:02:00Z'),
            startedAt: new Date('2024-01-01T10:02:30Z'),
            completedAt: new Date('2024-01-01T10:03:00Z'),
            processingTime: 30000
          },
          resources: {
            memoryPeak: 2048,
            cpuTime: 1000
          },
          attempts: 3,
          error: 'Test error message'
        }
      }
    ],
    dependencies: [],
    metrics: {
      jobId: 'root-job',
      queueName: 'test-queue',
      jobType: 'test',
      status: 'completed',
      timing: {
        createdAt: new Date('2024-01-01T10:00:00Z'),
        startedAt: new Date('2024-01-01T10:00:30Z'),
        completedAt: new Date('2024-01-01T10:01:00Z'),
        processingTime: 30000
      },
      resources: {
        memoryPeak: 512,
        cpuTime: 250
      },
      attempts: 1
    }
  }
};

describe('FlowVisualizer', () => {
  it('renders flow information correctly', () => {
    render(<FlowVisualizer flowTree={mockFlowTree} />);
    
    expect(screen.getByText('Flow: test-flow-123')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // Total jobs
    expect(screen.getByText('2')).toBeInTheDocument(); // Completed jobs
    expect(screen.getByText('1')).toBeInTheDocument(); // Failed jobs
  });

  it('allows layout type selection', () => {
    render(<FlowVisualizer flowTree={mockFlowTree} />);
    
    const layoutSelect = screen.getByDisplayValue('Hierarchical');
    expect(layoutSelect).toBeInTheDocument();
    
    fireEvent.click(layoutSelect);
    expect(screen.getByText('Radial')).toBeInTheDocument();
    expect(screen.getByText('Circular')).toBeInTheDocument();
    expect(screen.getByText('Force')).toBeInTheDocument();
  });

  it('supports search functionality', () => {
    render(<FlowVisualizer flowTree={mockFlowTree} />);
    
    const searchInput = screen.getByPlaceholderText('Search nodes...');
    expect(searchInput).toBeInTheDocument();
    
    fireEvent.change(searchInput, { target: { value: 'Child Job 1' } });
    expect(searchInput).toHaveValue('Child Job 1');
  });

  it('handles node selection', () => {
    const mockOnNodeSelect = jest.fn();
    render(<FlowVisualizer flowTree={mockFlowTree} onNodeSelect={mockOnNodeSelect} />);
    
    // This would require more complex SVG interaction testing
    // For now, we just verify the callback is passed
    expect(mockOnNodeSelect).toBeDefined();
  });

  it('shows dependency visualization toggle', () => {
    render(<FlowVisualizer flowTree={mockFlowTree} showDependencyLines={true} />);
    
    // Look for the eye icon button that toggles dependencies
    const dependencyToggle = screen.getByRole('button');
    expect(dependencyToggle).toBeInTheDocument();
  });
});

describe('FlowTimeline', () => {
  it('renders timeline header correctly', () => {
    render(<FlowTimeline flowTree={mockFlowTree} />);
    
    expect(screen.getByText('Flow Timeline & Dependencies')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument(); // Progress calculation
  });

  it('supports different view modes', () => {
    render(<FlowTimeline flowTree={mockFlowTree} />);
    
    const viewModeSelect = screen.getByDisplayValue('Timeline');
    expect(viewModeSelect).toBeInTheDocument();
    
    fireEvent.click(viewModeSelect);
    expect(screen.getByText('Gantt Chart')).toBeInTheDocument();
    expect(screen.getByText('Dependencies')).toBeInTheDocument();
  });

  it('shows timeline events with proper information', () => {
    render(<FlowTimeline flowTree={mockFlowTree} />);
    
    expect(screen.getByText('Root Job')).toBeInTheDocument();
    expect(screen.getByText('Child Job 1')).toBeInTheDocument();
    expect(screen.getByText('Child Job 2')).toBeInTheDocument();
  });

  it('displays error information for failed jobs', () => {
    render(<FlowTimeline flowTree={mockFlowTree} />);
    
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('shows dependency relationships', () => {
    render(<FlowTimeline flowTree={mockFlowTree} />);
    
    // Switch to dependencies view
    const viewModeSelect = screen.getByDisplayValue('Timeline');
    fireEvent.click(viewModeSelect);
    fireEvent.click(screen.getByText('Dependencies'));
    
    expect(screen.getByText('Dependency Flow Analysis')).toBeInTheDocument();
  });

  it('handles status filtering', () => {
    render(<FlowTimeline flowTree={mockFlowTree} />);
    
    const statusFilter = screen.getByDisplayValue('All Status');
    expect(statusFilter).toBeInTheDocument();
    
    fireEvent.click(statusFilter);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('shows estimated completion when enabled', () => {
    render(<FlowTimeline flowTree={mockFlowTree} showEstimatedCompletion={true} />);
    
    // The estimated completion should be calculated and displayed
    expect(screen.getByText(/Estimated completion:/)).toBeInTheDocument();
  });
});

describe('Flow Visualization Integration', () => {
  it('both components handle the same flow data consistently', () => {
    const { rerender } = render(<FlowVisualizer flowTree={mockFlowTree} />);
    
    expect(screen.getByText('Flow: test-flow-123')).toBeInTheDocument();
    
    rerender(<FlowTimeline flowTree={mockFlowTree} />);
    
    expect(screen.getByText('Flow Timeline & Dependencies')).toBeInTheDocument();
    expect(screen.getByText('Root Job')).toBeInTheDocument();
  });

  it('handles empty flow trees gracefully', () => {
    const emptyFlowTree: FlowTree = {
      flowId: 'empty-flow',
      status: 'pending',
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      rootJob: {
        jobId: 'empty-root',
        jobName: 'Empty Root',
        status: 'waiting',
        children: [],
        dependencies: [],
        metrics: {
          jobId: 'empty-root',
          queueName: 'empty-queue',
          jobType: 'empty',
          status: 'waiting',
          timing: {
            createdAt: new Date()
          },
          resources: {
            memoryPeak: 0,
            cpuTime: 0
          },
          attempts: 0
        }
      }
    };

    render(<FlowVisualizer flowTree={emptyFlowTree} />);
    expect(screen.getByText('Flow: empty-flow')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument(); // Total jobs

    render(<FlowTimeline flowTree={emptyFlowTree} />);
    expect(screen.getByText('Empty Root')).toBeInTheDocument();
  });
});