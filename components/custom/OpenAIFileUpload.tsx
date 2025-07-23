"use client";

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { v4 as uuidv4 } from 'uuid';
import type { FileWithContent } from '@/hooks/useChatwitIA';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  AudioWaveform, 
  File as FileIcon, 
  FileImage, 
  FolderArchive, 
  UploadCloud, 
  Video, 
  X 
} from 'lucide-react';
import { toast } from 'sonner';
import { FileTypes, uploadFileWithAssistants, validateFileForOpenAI, getFilePurpose } from '@/services/assistantsFileHandler';
import type { FilePurpose } from '@/services/openai';

interface OpenAIFileUploadProps {
  onFileUploaded?: (file: FileWithContent) => void;
  onFileRemoved?: (fileId: string) => void;
  uploadPurpose?: FilePurpose;
}

// File status type
type FileStatus = 'uploading' | 'complete' | 'error';

// Extended file object with upload info
interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: FileStatus;
  error?: string;
  openaiFileId?: string;
}

const FileColors = {
  image: {
    bgColor: "bg-purple-600",
    fillColor: "fill-purple-600",
  },
  pdf: {
    bgColor: "bg-blue-400",
    fillColor: "fill-blue-400",
  },
  audio: {
    bgColor: "bg-yellow-400",
    fillColor: "fill-yellow-400",
  },
  video: {
    bgColor: "bg-green-400",
    fillColor: "fill-green-400",
  },
  other: {
    bgColor: "bg-gray-400",
    fillColor: "fill-gray-400",
  }
};

export default function OpenAIFileUpload({ 
  onFileUploaded, 
  onFileRemoved,
  uploadPurpose = 'user_data'
}: OpenAIFileUploadProps) {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  
  // Helper to get file icon and color based on file type
  const getFileIconAndColor = (file: File) => {
    if (file.type.includes(FileTypes.Image)) {
      return {
        icon: <FileImage size={40} className={FileColors.image.fillColor} />,
        color: FileColors.image.bgColor,
      };
    }
    if (file.type.includes(FileTypes.Pdf)) {
      return {
        icon: <FileIcon size={40} className={FileColors.pdf.fillColor} />,
        color: FileColors.pdf.bgColor,
      };
    }
    if (file.type.includes(FileTypes.Audio)) {
      return {
        icon: <AudioWaveform size={40} className={FileColors.audio.fillColor} />,
        color: FileColors.audio.bgColor,
      };
    }
    if (file.type.includes(FileTypes.Video)) {
      return {
        icon: <Video size={40} className={FileColors.video.fillColor} />,
        color: FileColors.video.bgColor,
      };
    }
    return {
      icon: <FolderArchive size={40} className={FileColors.other.fillColor} />,
      color: FileColors.other.bgColor,
    };
  };
  
  // Upload a file to OpenAI
  const uploadFile = async (uploadingFile: UploadingFile) => {
    try {
      // Validate file before upload
      const validation = validateFileForOpenAI(uploadingFile.file);
      if (!validation.valid) {
        setUploadingFiles(prev => 
          prev.map(f => 
            f.id === uploadingFile.id 
              ? { ...f, status: 'error', error: validation.error, progress: 0 } 
              : f
          )
        );
        toast.error(`File validation failed: ${validation.error}`);
        return;
      }
      
      // Determine the purpose based on the file type (if not already specified)
      const purpose = uploadPurpose || getFilePurpose(uploadingFile.file);
      
      // Upload the file with progress updates
      const result = await uploadFileWithAssistants(
        uploadingFile.file,
        purpose,
        (progress) => {
          setUploadingFiles(prev => 
            prev.map(f => 
              f.id === uploadingFile.id 
                ? { ...f, progress } 
                : f
            )
          );
        }
      );
      
      // Update the file status to complete
      setUploadingFiles(prev => 
        prev.map(f => 
          f.id === uploadingFile.id 
            ? { 
                ...f, 
                status: 'complete', 
                progress: 100,
                openaiFileId: result.id 
              } 
            : f
        )
      );
      
      // Notify parent component
      if (onFileUploaded) {
        onFileUploaded({
          id: result.id,
          filename: result.filename,
          purpose: result.purpose,
          bytes: result.bytes,
          created_at: result.created_at
        });
      }
      
      toast.success(`${uploadingFile.file.name} uploaded successfully`);
    } catch (error: any) {
      console.error('Error uploading file to OpenAI:', error);
      
      setUploadingFiles(prev => 
        prev.map(f => 
          f.id === uploadingFile.id 
            ? { 
                ...f, 
                status: 'error', 
                error: error.message || 'Upload failed',
                progress: 0
              } 
            : f
        )
      );
      
      toast.error(`Failed to upload ${uploadingFile.file.name}`, {
        description: error.message || 'Unknown error occurred'
      });
    }
  };
  
  // Handle file drop
  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Create new uploading file entries
    const newFiles = acceptedFiles.map(file => ({
      id: uuidv4(),
      file,
      progress: 0,
      status: 'uploading' as FileStatus
    }));
    
    setUploadingFiles(prev => [...prev, ...newFiles]);
    
    // Start uploading each file
    newFiles.forEach(file => {
      uploadFile(file);
    });
  }, []);
  
  // Configure dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt', '.md'],
      'application/json': ['.json', '.jsonl'],
      'text/csv': ['.csv']
    },
    maxSize: 25 * 1024 * 1024 // 25MB limit for OpenAI
  });
  
  // Remove a file from the list
  const handleRemoveFile = (fileId: string, openaiFileId?: string) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
    
    // If the file was successfully uploaded, notify parent
    if (openaiFileId && onFileRemoved) {
      onFileRemoved(openaiFileId);
    }
  };
  
  return (
    <div className="w-full">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`relative flex flex-col items-center justify-center w-full py-6 border-2 border-dashed rounded-lg cursor-pointer 
        ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}
        transition-colors duration-200 ease-in-out`}
      >
        <div className="text-center">
          <div className="border p-2 rounded-md max-w-min mx-auto">
            <UploadCloud size={20} />
          </div>
          <p className="mt-2 text-sm text-gray-600">
            <span className="font-semibold">Drag files here</span> or click to upload
          </p>
          <p className="text-xs text-gray-500">
            Supported formats: PDF, Images, Text, CSV, JSON (max 25MB)
          </p>
        </div>
        <input {...getInputProps()} className="hidden" />
      </div>
      
      {/* Files in progress */}
      {uploadingFiles.length > 0 && (
        <ScrollArea className="h-48 mt-4 max-w-full">
          <div className="space-y-2 pr-3">
            {uploadingFiles.map((file) => (
              <div
                key={file.id}
                className={`flex justify-between gap-2 rounded-lg overflow-hidden border group hover:pr-0 pr-2
                  ${file.status === 'error' ? 'border-red-200 bg-red-50' : 'border-slate-100'}`}
              >
                <div className="flex items-center flex-1 p-2">
                  <div className="text-white">
                    {getFileIconAndColor(file.file).icon}
                  </div>
                  <div className="w-full ml-2 space-y-1">
                    <div className="text-sm flex justify-between">
                      <p className="text-muted-foreground truncate max-w-[200px]">
                        {file.file.name}
                      </p>
                      <span className="text-xs">
                        {file.status === 'uploading' ? `${file.progress}%` : 
                         file.status === 'complete' ? 'Complete' : 'Error'}
                      </span>
                    </div>
                    {file.status === 'uploading' && (
                      <Progress
                        value={file.progress}
                        className={getFileIconAndColor(file.file).color}
                      />
                    )}
                    {file.status === 'error' && (
                      <p className="text-xs text-red-500">{file.error}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveFile(file.id, file.openaiFileId)}
                  className="bg-red-500 text-white transition-all items-center justify-center cursor-pointer px-2 hidden group-hover:flex"
                  aria-label={`Remove ${file.file.name}`}
                >
                  <X size={20} />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
} 