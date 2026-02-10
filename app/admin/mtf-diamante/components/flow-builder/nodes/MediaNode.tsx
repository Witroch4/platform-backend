'use client';

import { memo, useCallback, useState, useEffect } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { Image as ImageIcon, Video, FileText, Music, Upload, X, ExternalLink, File } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NodeContextMenu } from '../ui/NodeContextMenu';
import type { MediaNodeData, MediaType } from '@/types/flow-builder';
import { NODE_COLORS, FlowNodeType } from '@/types/flow-builder';
import MinIOMediaUpload, { type MinIOMediaFile } from '../../shared/MinIOMediaUpload';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EditableText } from '../ui/EditableText';
import { CHANNEL_CHAR_LIMITS } from '@/types/flow-builder';

const colors = NODE_COLORS[FlowNodeType.MEDIA];

type MediaNodeProps = NodeProps & {
  data: MediaNodeData & { [key: string]: unknown };
}

const MEDIA_TYPE_CONFIG: Record<MediaType, {
  icon: React.ElementType;
  label: string;
  allowedTypes: string[];
  maxSizeMB: number;
  hasCaption: boolean;
}> = {
  image: {
    icon: ImageIcon,
    label: 'Imagem',
    allowedTypes: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif'],
    maxSizeMB: 5,
    hasCaption: true,
  },
  video: {
    icon: Video,
    label: 'Vídeo',
    allowedTypes: ['video/mp4', 'video/webm', 'video/3gpp'],
    maxSizeMB: 16,
    hasCaption: true,
  },
  document: {
    icon: FileText,
    label: 'Documento',
    allowedTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
    ],
    maxSizeMB: 100,
    hasCaption: false,
  },
  audio: {
    icon: Music,
    label: 'Áudio',
    allowedTypes: ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'],
    maxSizeMB: 16,
    hasCaption: false,
  },
};

export const MediaNode = memo(
  ({ id, data, selected }: MediaNodeProps) => {
    const { setNodes, setEdges, getNodes } = useReactFlow();
    const [mediaType, setMediaType] = useState<MediaType>(data.mediaType || 'image');
    const [showUpload, setShowUpload] = useState(!data.mediaUrl);
    const [uploadedFiles, setUploadedFiles] = useState<MinIOMediaFile[]>(
      data.mediaUrl
        ? [{ id: 'existing', url: data.mediaUrl, status: 'success', progress: 100, mime_type: data.mimeType }]
        : []
    );
    const [caption, setCaption] = useState(data.caption || '');

    const isConfigured = data.isConfigured && data.mediaUrl;
    const config = MEDIA_TYPE_CONFIG[mediaType];
    const MediaIcon = config.icon;

    // Sync state with node data when mediaType changes
    useEffect(() => {
      if (data.mediaType !== mediaType) {
        setNodes((nodes) =>
          nodes.map((node) =>
            node.id === id
              ? { ...node, data: { ...node.data, mediaType } }
              : node
          )
        );
      }
    }, [mediaType, data.mediaType, id, setNodes]);

    // Handle upload complete
    const handleUploadComplete = useCallback((file: MinIOMediaFile) => {
      if (file.url) {
        setNodes((nodes) =>
          nodes.map((node) =>
            node.id === id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    mediaUrl: file.url,
                    filename: file.file?.name,
                    mimeType: file.mime_type,
                    isConfigured: true,
                  },
                }
              : node
          )
        );
        setShowUpload(false);
      }
    }, [id, setNodes]);

    // Handle caption change
    const handleCaptionChange = useCallback((value: string) => {
      setCaption(value);
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, caption: value } }
            : node
        )
      );
    }, [id, setNodes]);

    // Handle remove media
    const handleRemoveMedia = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      setUploadedFiles([]);
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  mediaUrl: undefined,
                  filename: undefined,
                  mimeType: undefined,
                  isConfigured: false,
                },
              }
            : node
        )
      );
      setShowUpload(true);
    }, [id, setNodes]);

    const handleDuplicate = useCallback(() => {
      const nodes = getNodes();
      const currentNode = nodes.find(n => n.id === id);
      if (!currentNode) return;

      const newId = `media-${Date.now()}`;
      const newNode = {
        ...currentNode,
        id: newId,
        position: {
          x: currentNode.position.x + 50,
          y: currentNode.position.y + 50,
        },
        data: {
          ...currentNode.data,
          label: `${currentNode.data.label || 'Mídia'} (cópia)`,
        },
        selected: false,
      };

      setNodes((nodes) => [...nodes, newNode]);
    }, [id, getNodes, setNodes]);

    const handleDelete = useCallback(() => {
      setNodes((nodes) => nodes.filter(n => n.id !== id));
      setEdges((edges) => edges.filter(e => e.source !== id && e.target !== id));
    }, [id, setNodes, setEdges]);

    // Get file extension from URL or filename
    const getFileExtension = (url?: string, filename?: string): string => {
      const name = filename || url || '';
      const ext = name.split('.').pop()?.toLowerCase() || '';
      return ext;
    };

    const extension = getFileExtension(data.mediaUrl, data.filename);

    return (
      <NodeContextMenu onDuplicate={handleDuplicate} onDelete={handleDelete}>
        <div
          className={cn(
            'min-w-[280px] max-w-[320px] rounded-lg border-2 shadow-md transition-all',
            colors.bg,
            colors.border,
            selected && 'ring-2 ring-primary ring-offset-2',
            !isConfigured && 'border-dashed opacity-80'
          )}
        >
          {/* Handle de entrada (top) */}
          <Handle
            type="target"
            position={Position.Top}
            className="!h-3 !w-3 !bg-teal-500 !border-2 !border-white"
          />

          {/* Header */}
          <div className="flex items-center gap-2 border-b px-3 py-2 bg-teal-100/50 dark:bg-teal-900/30">
            <MediaIcon className={cn('h-4 w-4', colors.icon)} />
            <span className="font-medium text-sm">
              {data.label || 'Enviar Mídia'}
            </span>
          </div>

          {/* Seletor de tipo */}
          <div className="px-3 pt-3">
            <Tabs value={mediaType} onValueChange={(v) => setMediaType(v as MediaType)}>
              <TabsList className="grid grid-cols-4 h-8">
                <TabsTrigger value="image" className="text-xs px-2 py-1 nodrag">
                  <ImageIcon className="h-3.5 w-3.5" />
                </TabsTrigger>
                <TabsTrigger value="video" className="text-xs px-2 py-1 nodrag">
                  <Video className="h-3.5 w-3.5" />
                </TabsTrigger>
                <TabsTrigger value="document" className="text-xs px-2 py-1 nodrag">
                  <FileText className="h-3.5 w-3.5" />
                </TabsTrigger>
                <TabsTrigger value="audio" className="text-xs px-2 py-1 nodrag">
                  <Music className="h-3.5 w-3.5" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Corpo */}
          <div className="px-3 py-3">
            {showUpload || !data.mediaUrl ? (
              <div className="nodrag">
                <MinIOMediaUpload
                  uploadedFiles={uploadedFiles}
                  setUploadedFiles={setUploadedFiles}
                  allowedTypes={config.allowedTypes}
                  maxSizeMB={config.maxSizeMB}
                  title={`Upload de ${config.label}`}
                  description={`Arraste ${mediaType === 'image' ? 'uma imagem' : mediaType === 'video' ? 'um vídeo' : mediaType === 'document' ? 'um documento' : 'um áudio'} aqui`}
                  maxFiles={1}
                  onUploadComplete={handleUploadComplete}
                />
              </div>
            ) : (
              <div className="space-y-3">
                {/* Preview da mídia */}
                <div className="relative group">
                  {mediaType === 'image' && data.mediaUrl && (
                    <div className="relative aspect-video bg-muted rounded-md overflow-hidden">
                      <img
                        src={data.mediaUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {mediaType === 'video' && data.mediaUrl && (
                    <div className="relative aspect-video bg-black rounded-md overflow-hidden">
                      <video
                        src={data.mediaUrl}
                        className="w-full h-full object-contain"
                        controls={false}
                        muted
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Video className="h-10 w-10 text-white/80" />
                      </div>
                    </div>
                  )}

                  {mediaType === 'document' && (
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                      <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-teal-100 dark:bg-teal-900 rounded">
                        <FileText className="h-5 w-5 text-teal-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {data.filename || 'documento'}
                        </p>
                        <p className="text-xs text-muted-foreground uppercase">
                          {extension || 'PDF'}
                        </p>
                      </div>
                    </div>
                  )}

                  {mediaType === 'audio' && (
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                      <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-teal-100 dark:bg-teal-900 rounded">
                        <Music className="h-5 w-5 text-teal-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {data.filename || 'áudio'}
                        </p>
                        <p className="text-xs text-muted-foreground uppercase">
                          {extension || 'AUDIO'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Botões de ação overlay */}
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {data.mediaUrl && (
                      <a
                        href={data.mediaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded bg-black/50 hover:bg-black/70 text-white transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      onClick={handleRemoveMedia}
                      className="p-1.5 rounded bg-red-500/80 hover:bg-red-500 text-white transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Caption (para imagens e vídeos) */}
                {config.hasCaption && (
                  <div className="nodrag">
                    <EditableText
                      value={caption}
                      onChange={handleCaptionChange}
                      label="Legenda"
                      placeholder="Legenda (opcional)"
                      className="text-sm"
                      minRows={1}
                      maxLength={CHANNEL_CHAR_LIMITS.whatsapp.body}
                    />
                  </div>
                )}

                {/* Botão para trocar mídia */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full nodrag"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowUpload(true);
                  }}
                >
                  <Upload className="h-3.5 w-3.5 mr-2" />
                  Trocar {config.label.toLowerCase()}
                </Button>
              </div>
            )}
          </div>

          {/* Handle de saída (bottom) */}
          <Handle
            type="source"
            position={Position.Bottom}
            className="!h-3 !w-3 !bg-teal-500 !border-2 !border-white"
          />
        </div>
      </NodeContextMenu>
    );
  }
);

MediaNode.displayName = 'MediaNode';

export default MediaNode;
