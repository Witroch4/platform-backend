
// services/openai-components/server-files.ts
import OpenAI, { toFile } from "openai";
import { FileUploadOptions, FilePurpose } from "./types";

/**
 * Upload de arquivos, agora usando toFile para evitar erro 413.
 */
export async function uploadFile(
  this: { client: OpenAI },
  file: File,
  options: FileUploadOptions
) {
  try {
    // Converte File para Buffer e usa helper toFile
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const oaiFile = await toFile(buffer, file.name, { type: file.type });

    // PDF não é suportado em "vision" → redireciona para assistants
    const isPdf = file.type === "application/pdf";
    const purpose =
      isPdf && options.purpose === "vision" ? "assistants" : options.purpose;

    // Se for PDF no propósito vision, faz raw fetch para permitir application/pdf
    if (isPdf && options.purpose === "vision") {
      const formData = new FormData();
      formData.append("file", oaiFile as unknown as any, file.name);
      formData.append("purpose", "assistants"); // Força assistants para PDFs

      const resp = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: formData,
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Erro upload PDF vision: ${resp.status} - ${text}`);
      }
      return await resp.json();
    }

    // Para demais formatos/usos, usa SDK normalmente
    const response = await this.client.files.create({
      file: oaiFile,
      purpose: purpose as any,
    });

    console.log("Servidor: uploadFile concluído com sucesso:", response);
    return response;
  } catch (err: any) {
    console.error("Servidor: erro no uploadFile()", err);
    throw err;
  }
}

export async function uploadFileFromPath(
  this: { client: OpenAI },
  filePath: string,
  opts: { filename: string; mimeType: string; purpose: FilePurpose }
) {
  try {
    // Check if running in a server environment
    if (typeof window !== "undefined") {
      throw new Error(
        "uploadFileFromPath só pode ser usado no lado do servidor"
      );
    }

    // Implementação para ambiente Node.js usando eval para evitar bundling
    console.log(`Servidor: Enviando arquivo do caminho: ${filePath}`);

    // Usar eval para evitar que o webpack tente resolver 'fs' no cliente
    const fs = eval("require")("fs");

    // Verificar se o arquivo existe
    if (!fs.existsSync(filePath)) {
      throw new Error(`Arquivo não encontrado: ${filePath}`);
    }

    // Ler o arquivo
    const fileBuffer = fs.readFileSync(filePath);

    // Criar um File object para usar com toFile
    const oaiFile = await toFile(fileBuffer, opts.filename, {
      type: opts.mimeType,
    });

    // PDF não é suportado em "vision" → redireciona para assistants
    const isPdf = opts.mimeType === "application/pdf";
    const purpose =
      isPdf && opts.purpose === "vision" ? "assistants" : opts.purpose;

    // Se for PDF no propósito vision, faz raw fetch para permitir application/pdf
    if (isPdf && opts.purpose === "vision") {
      const formData = new FormData();
      formData.append("file", oaiFile as unknown as any, opts.filename);
      formData.append("purpose", "assistants"); // Força assistants para PDFs

      const response = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Erro upload PDF via path: ${response.status} - ${text}`
        );
      }

      const result = await response.json();
      console.log("Servidor: uploadFileFromPath (PDF) concluído:", result.id);
      return result;
    }

    // Para demais formatos/usos, usa SDK normalmente
    const response = await this.client.files.create({
      file: oaiFile,
      purpose: purpose as any,
    });

    console.log(
      "Servidor: uploadFileFromPath concluído com sucesso:",
      response.id
    );
    return response;
  } catch (error) {
    console.error("Erro ao enviar arquivo do caminho:", filePath, error);
    throw error;
  }
}

export async function listFiles(this: { client: OpenAI }, purpose?: FilePurpose) {
  try {
    let url = "https://api.openai.com/v1/files";
    if (purpose) {
      url += `?purpose=${purpose}`;
    }

    console.log(`Servidor: Listando arquivos com URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.client.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(
        `Erro ao listar arquivos: ${response.status} - ${errorData}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Servidor: Erro detalhado ao listar arquivos:", error);
    throw error;
  }
}

export async function retrieveFile(this: { client: OpenAI }, fileId: string) {
  try {
    console.log(`Servidor: Obtendo detalhes do arquivo: ${fileId}`);

    const response = await fetch(
      `https://api.openai.com/v1/files/${fileId}`,
      {
        headers: {
          Authorization: `Bearer ${this.client.apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(
        `Erro ao obter arquivo: ${response.status} - ${errorData}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Servidor: Erro detalhado ao obter arquivo:", error);
    throw error;
  }
}

export async function retrieveFileContent(this: { client: OpenAI }, fileId: string) {
  try {
    console.log(`Servidor: Obtendo conteúdo do arquivo: ${fileId}`);

    const response = await fetch(
      `https://api.openai.com/v1/files/${fileId}/content`,
      {
        headers: {
          Authorization: `Bearer ${this.client.apiKey}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(
        `Erro ao obter conteúdo do arquivo: ${response.status} - ${errorData}`
      );
    }

    // Para contenttdo binário
    const blob = await response.blob();
    return blob;
  } catch (error) {
    console.error(
      "Servidor: Erro detalhado ao obter conteúdo do arquivo:",
      error
    );
    throw error;
  }
}

export async function deleteFile(this: { client: OpenAI }, fileId: string) {
  try {
    console.log(`Servidor: Excluindo arquivo: ${fileId}`);

    const response = await fetch(
      `https://api.openai.com/v1/files/${fileId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.client.apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(
        `Erro ao excluir arquivo: ${response.status} - ${errorData}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Servidor: Erro detalhado ao excluir arquivo:", error);
    throw error;
  }
}
