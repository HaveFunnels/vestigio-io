"use client";

/**
 * FileUploadZone — Drag-and-drop file upload for chat context.
 * Supports: CSV, JSON, TXT, PDF (text extraction handled server-side).
 * Files are sent as context with the next message.
 */

import { useState, useCallback, useRef } from "react";

export interface UploadedFile {
  name: string;
  size: number;
  type: string;
  content: string; // text content or base64
}

interface FileUploadZoneProps {
  onFilesAdded: (files: UploadedFile[]) => void;
  children: React.ReactNode;
}

const ALLOWED_TYPES = [
  "text/csv",
  "application/json",
  "text/plain",
  "text/markdown",
  "application/pdf",
];
const ALLOWED_EXTENSIONS = [".csv", ".json", ".txt", ".md", ".pdf"];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_FILES = 3;

export function FileUploadZone({ onFilesAdded, children }: FileUploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const processFiles = useCallback(async (fileList: FileList) => {
    const files = Array.from(fileList).slice(0, MAX_FILES);
    const results: UploadedFile[] = [];

    for (const file of files) {
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) continue;
      if (file.size > MAX_FILE_SIZE) continue;

      try {
        const content = await readFileAsText(file);
        results.push({
          name: file.name,
          size: file.size,
          type: file.type || ext,
          content: content.slice(0, 50_000), // Cap content at 50KB
        });
      } catch { /* skip unreadable files */ }
    }

    if (results.length > 0) onFilesAdded(results);
  }, [onFilesAdded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    dragCounter.current = 0;
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative flex flex-1 flex-col overflow-hidden"
    >
      {children}

      {/* Overlay when dragging */}
      {dragging && (
        <div className="absolute inset-0 z-40 flex items-center justify-center rounded-lg border-2 border-dashed border-emerald-500/50 bg-emerald-500/5 backdrop-blur-sm">
          <div className="text-center">
            <svg className="mx-auto h-8 w-8 text-emerald-400" viewBox="0 0 24 24" fill="none">
              <path d="M12 16V4m0 0L8 8m4-4l4 4M4 20h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="mt-2 text-sm text-emerald-400">Drop files here</p>
            <p className="mt-0.5 text-[10px] text-content-muted">CSV, JSON, TXT, MD, PDF (max 2MB)</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Attached file chip — shown below input bar */
export function FileChip({ file, onRemove }: { file: UploadedFile; onRemove: () => void }) {
  const sizeLabel = file.size > 1024 ? `${(file.size / 1024).toFixed(0)}KB` : `${file.size}B`;

  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-surface-inset px-2 py-1">
      <svg className="h-3.5 w-3.5 text-content-muted" viewBox="0 0 16 16" fill="none">
        <path d="M9 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V5L9 1z" stroke="currentColor" strokeWidth="1.25" />
        <path d="M9 1v4h4" stroke="currentColor" strokeWidth="1.25" />
      </svg>
      <span className="text-xs text-content-secondary">{file.name}</span>
      <span className="text-[10px] text-content-faint">{sizeLabel}</span>
      <button onClick={onRemove} className="ml-0.5 rounded p-0.5 text-content-faint hover:bg-surface-card-hover hover:text-content-muted">
        <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none">
          <path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
