"use client";

/**
 * Painel flutuante de transcrições
 * Mostra progresso em tempo real das digitações de manuscritos
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Minimize2,
  Maximize2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TranscriptionStatus } from "../hooks/useTranscriptionProgress";

interface TranscriptionPanelProps {
  transcriptions: TranscriptionStatus[];
  onViewDetails?: (leadID: string) => void;
  onDismiss?: (leadID: string) => void;
  onClose?: () => void;
}

export function TranscriptionPanel({
  transcriptions,
  onViewDetails,
  onDismiss,
  onClose,
}: TranscriptionPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const activeTranscriptions = transcriptions.filter(
    (t) => t.status === "queued" || t.status === "processing"
  );
  const completedTranscriptions = transcriptions.filter((t) => t.status === "completed");
  const failedTranscriptions = transcriptions.filter((t) => t.status === "failed");

  if (!isVisible || transcriptions.length === 0) {
    return null;
  }

  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]">
      <Card className="shadow-lg border-2">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <CardTitle className="text-base">
              Digitações ({transcriptions.length})
            </CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              {isMinimized ? (
                <Maximize2 className="h-4 w-4" />
              ) : (
                <Minimize2 className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        {!isMinimized && (
          <CardContent className="pt-0">
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {/* Transcrições ativas */}
                {activeTranscriptions.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                      Em andamento
                    </h4>
                    {activeTranscriptions.map((transcription) => (
                      <TranscriptionItem
                        key={transcription.leadID}
                        transcription={transcription}
                        onViewDetails={onViewDetails}
                        onDismiss={onDismiss}
                      />
                    ))}
                  </div>
                )}

                {/* Transcrições concluídas */}
                {completedTranscriptions.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                      Concluídas
                    </h4>
                    {completedTranscriptions.map((transcription) => (
                      <TranscriptionItem
                        key={transcription.leadID}
                        transcription={transcription}
                        onViewDetails={onViewDetails}
                        onDismiss={onDismiss}
                      />
                    ))}
                  </div>
                )}

                {/* Transcrições falhadas */}
                {failedTranscriptions.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-destructive uppercase">
                      Com erro
                    </h4>
                    {failedTranscriptions.map((transcription) => (
                      <TranscriptionItem
                        key={transcription.leadID}
                        transcription={transcription}
                        onViewDetails={onViewDetails}
                        onDismiss={onDismiss}
                      />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

interface TranscriptionItemProps {
  transcription: TranscriptionStatus;
  onViewDetails?: (leadID: string) => void;
  onDismiss?: (leadID: string) => void;
}

function TranscriptionItem({
  transcription,
  onViewDetails,
  onDismiss,
}: TranscriptionItemProps) {
  const { leadID, status, currentPage, totalPages, percentage, estimatedTimeRemaining, position, error } =
    transcription;

  const getStatusIcon = () => {
    switch (status) {
      case "queued":
        return <Clock className="h-4 w-4 animate-pulse" />;
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case "queued":
        return (
          <Badge variant="secondary" className="text-xs">
            Na fila (pos. {position ?? "?"})
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="default" className="text-xs">
            {percentage ?? 0}%
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="outline" className="text-xs border-green-600 text-green-600">
            Concluído
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="text-xs">
            Erro
          </Badge>
        );
      default:
        return null;
    }
  };

  const formatTime = (seconds?: number) => {
    if (!seconds) return "";
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div
      className={cn(
        "p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors",
        status === "failed" && "border-destructive/50"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{getStatusIcon()}</div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">Lead {leadID.slice(0, 8)}...</p>
            {getStatusBadge()}
          </div>

          {status === "processing" && totalPages && (
            <>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Página {currentPage}/{totalPages}
                  </span>
                  {estimatedTimeRemaining && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      ~{formatTime(estimatedTimeRemaining)}
                    </span>
                  )}
                </div>
                <Progress value={percentage ?? 0} className="h-1.5" />
              </div>
            </>
          )}

          {status === "failed" && error && (
            <p className="text-xs text-destructive line-clamp-2">{error}</p>
          )}

          <div className="flex items-center gap-1 pt-1">
            {onViewDetails && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onViewDetails(leadID)}
              >
                Ver detalhes
              </Button>
            )}
            {onDismiss && status !== "processing" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onDismiss(leadID)}
              >
                Dispensar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
