import type { ChangeEvent, DragEvent } from 'react';

/** Keep only files that look like a BugCase report ZIP (by MIME type or `.zip` extension). */
export function zipFilesFrom(list: FileList | null): File[] {
  if (!list) {
    return [];
  }
  return Array.from(list).filter(
    (file) =>
      file.type === 'application/zip' ||
      file.type === 'application/x-zip-compressed' ||
      /\.zip$/i.test(file.name),
  );
}

export interface DropZoneProps {
  /** Receives every dropped/selected `.zip` file (multi-select supported). */
  readonly onFiles: (files: File[]) => void;
}

/**
 * Multi-file report intake (S4-02). A drop target + file picker that hands all selected `.zip`
 * files to the caller; the caller opens each as a tab. Purely presentational — owns no report state.
 */
export function DropZone({ onFiles }: DropZoneProps) {
  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    onFiles(zipFilesFrom(event.dataTransfer.files));
  }

  function onSelect(event: ChangeEvent<HTMLInputElement>): void {
    onFiles(zipFilesFrom(event.target.files));
    // Allow re-selecting the same file(s) later.
    event.target.value = '';
  }

  return (
    <div
      data-testid="dropzone"
      onDrop={onDrop}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      className="mx-auto mt-2 max-w-3xl rounded-[var(--bc-radius)] border-2 border-dashed border-[var(--bc-border)] p-8 text-center"
    >
      <p className="text-[var(--bc-fg-muted)]">Drag BugCase report .zip files here, or</p>
      {/*
        The input is `sr-only`, never `hidden`. `display:none` would take it out of the tab order,
        and this is the dashboard's only entry point — a keyboard user would have no way in (S4-27).
        The explicit for/id pairing keeps the label as the click target for pointer users.
      */}
      <label
        htmlFor="dropzone-file-input"
        className="mt-2 inline-block cursor-pointer font-medium text-[var(--bc-accent)]"
      >
        choose files
      </label>
      <input
        id="dropzone-file-input"
        type="file"
        accept=".zip,application/zip"
        multiple
        className="sr-only"
        onChange={onSelect}
      />
    </div>
  );
}
