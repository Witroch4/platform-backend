"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Type, Image, Video, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import MinIOMediaUpload, { MinIOMediaFile } from "../../shared/MinIOMediaUpload";
import type { HeaderSectionProps, MessageHeader, HeaderType } from "./types";

export const HeaderSection: React.FC<HeaderSectionProps> = ({
  message,
  onMessageUpdate,
  disabled = false,
  isFieldValid,
  headerMediaFiles,
  setHeaderMediaFiles,
  handleValidationError,
  validateField,
}) => {
  const handleHeaderTypeChange = React.useCallback(
    (type: HeaderType) => {
      try {
        const newHeader: MessageHeader = {
          type,
          content: type === "text" ? message.header?.content || "" : "",
        };
        onMessageUpdate({ header: newHeader });

        // Clear header media files when switching to text type
        if (type === "text") {
          setHeaderMediaFiles([]);
        }
      } catch (error) {
        handleValidationError(error);
      }
    },
    [
      onMessageUpdate,
      message.header,
      handleValidationError,
      setHeaderMediaFiles,
    ]
  );

  const handleHeaderContentChange = React.useCallback(
    (content: string) => {
      try {
        if (!message.header) return;

        // Se header é de texto e o conteúdo está vazio, remover header (opcional)
        if (message.header.type === "text" && !content.trim()) {
          onMessageUpdate({ header: undefined });
          return;
        }

        const updatedHeader: MessageHeader = {
          ...message.header,
          content,
          // Sempre persistir também em media_url para compatibilidade
          ...(message.header.type !== "text" && { media_url: content }),
        };
        onMessageUpdate({ header: updatedHeader });

        // Validate header content immediately
        validateField("header.content", content, {
          ...message,
          header: updatedHeader,
        });
      } catch (error) {
        handleValidationError(error);
      }
    },
    [
      onMessageUpdate,
      message.header,
      validateField,
      message,
      handleValidationError,
      setHeaderMediaFiles,
    ]
  );

  const handleMediaUpload = React.useCallback(
    (file: MinIOMediaFile) => {
      if (file.url) {
        handleHeaderContentChange(file.url);
      }
    },
    [handleHeaderContentChange]
  );

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Header (Optional)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Add a header to make your message more engaging
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="header-type">Header Type</Label>
          <Select
            value={message.header?.type || "text"}
            onValueChange={(value: HeaderType) => handleHeaderTypeChange(value)}
            disabled={disabled}
          >
            <SelectTrigger id="header-type">
              <SelectValue placeholder="Select header type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">
                <div className="flex items-center gap-2">
                  <Type className="h-4 w-4" />
                  Text
                </div>
              </SelectItem>
              <SelectItem value="image">
                <div className="flex items-center gap-2">
                  <Image className="h-4 w-4" />
                  Image
                </div>
              </SelectItem>
              <SelectItem value="video">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4" />
                  Video
                </div>
              </SelectItem>
              <SelectItem value="document">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Document
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(message.header?.type || "text") === "text" ? (
          <div className="space-y-2">
            <Label htmlFor="header-content">Header Text</Label>
            <Input
              id="header-content"
              value={message.header?.content || ""}
              onChange={(e) => handleHeaderContentChange(e.target.value)}
              placeholder="Enter header text..."
              disabled={disabled}
              maxLength={60}
              className={cn(
                !isFieldValid("header.content") &&
                  "border-destructive focus-visible:ring-destructive"
              )}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Upload {message.header?.type}</Label>
            <MinIOMediaUpload
              uploadedFiles={headerMediaFiles}
              setUploadedFiles={setHeaderMediaFiles}
              allowedTypes={
                message.header?.type === "image"
                  ? ["image/jpeg", "image/png", "image/jpg"]
                  : message.header?.type === "video"
                    ? ["video/mp4", "video/webm"]
                    : ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
              }
              maxSizeMB={
                message.header?.type === "video" ? 16 : 5
              }
              maxFiles={1}
              onUploadComplete={handleMediaUpload}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
