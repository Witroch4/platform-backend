'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, X, FileText, Image, Video } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface MediaUploadComponentProps {
  value: string;
  onChange: (url: string) => void;
  mediaType: 'image' | 'video' | 'document';
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  description?: string;
}

export const MediaUploadComponent: React.FC<MediaUploadComponentProps> = ({
  value,
  onChange,
  mediaType,
  placeholder,
  disabled = false,
  className,
  label,
  description
}) => {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const getAcceptedTypes = () => {
    switch (mediaType) {
      case 'image':
        return 'image/*';
      case 'video':
        return 'video/*';
      case 'document':
        return '.pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx';
      default:
        return '*/*';
    }
  };

  const getIcon = () => {
    switch (mediaType) {
      case 'image':
        return Image;
      case 'video':
        return Video;
      case 'document':
        return FileText;
      default:
        return Upload;
    }
  };

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file) return;

    // Validate file type
    const isValidType = (() => {
      switch (mediaType) {
        case 'image':
          return file.type.startsWith('image/');
        case 'video':
          return file.type.startsWith('video/');
        case 'document':
          return [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          ].includes(file.type);
        default:
          return true;
      }
    })();

    if (!isValidType) {
      toast.error(`Invalid file type for ${mediaType}`);
      return;
    }

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', mediaType);
      
      const response = await fetch('/api/admin/mtf-diamante/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload file');
      }

      const data = await response.json();
      onChange(data.url);
      toast.success(`${mediaType} uploaded successfully!`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(`Failed to upload ${mediaType}`);
    } finally {
      setUploading(false);
    }
  }, [mediaType, onChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const clearMedia = () => {
    onChange('');
  };

  const IconComponent = getIcon();

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <div className="space-y-1">
          <label className="text-sm font-medium leading-none">
            {label}
          </label>
          {description && (
            <p className="text-xs text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {/* URL Input */}
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || `${mediaType} URL`}
            disabled={disabled || uploading}
            className="flex-1"
          />
          {value && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={clearMedia}
              disabled={disabled}
              title="Clear media"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Upload Area */}
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-4 text-center transition-colors",
            dragOver && "border-primary bg-primary/5",
            !dragOver && "border-muted-foreground/25 hover:border-muted-foreground/50",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div className="flex flex-col items-center gap-2">
            <IconComponent className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm">
              <p className="font-medium">
                {uploading ? `Uploading ${mediaType}...` : `Drop ${mediaType} here or click to browse`}
              </p>
              <p className="text-muted-foreground text-xs">
                Max file size: 10MB
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || uploading}
              onClick={() => document.getElementById(`file-input-${mediaType}`)?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? 'Uploading...' : 'Browse Files'}
            </Button>
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          id={`file-input-${mediaType}`}
          type="file"
          accept={getAcceptedTypes()}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleFileUpload(file);
            }
          }}
          className="hidden"
          disabled={disabled}
        />

        {/* Preview */}
        {value && (
          <div className="mt-2">
            <div className="text-xs text-muted-foreground mb-1">Preview:</div>
            {mediaType === 'image' && (
              <img
                src={value}
                alt="Preview"
                className="max-w-full h-auto max-h-32 rounded border object-cover"
                onError={() => toast.error('Failed to load image preview')}
              />
            )}
            {mediaType === 'video' && (
              <video
                src={value}
                controls
                className="max-w-full h-auto max-h-32 rounded border"
                onError={() => toast.error('Failed to load video preview')}
              />
            )}
            {mediaType === 'document' && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded border">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground truncate">
                  {value.split('/').pop() || 'Document'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaUploadComponent;