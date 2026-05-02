import { FeedbackNotice, SectionCard } from "../pagePrimitives";

export interface ImportSectionProps {
  canImportFromVolume: boolean;
  isPickingImport: boolean;
  isImporting: boolean;
  runImportPicker: () => Promise<void>;
}

export function ImportSection({
  canImportFromVolume,
  isPickingImport,
  isImporting,
  runImportPicker,
}: ImportSectionProps) {
  return (
    <SectionCard
      title="Import folders from volume"
      description="Browse a connected volume and add its top-level folders as projects without running a full scan. Hidden and system folders are filtered automatically; folders already on this drive are skipped."
      action={
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => void runImportPicker()}
          disabled={!canImportFromVolume || isPickingImport || isImporting}
        >
          {isPickingImport ? "Opening…" : "Choose folder…"}
        </button>
      }
    >
      {!canImportFromVolume ? (
        <FeedbackNotice
          tone="warning"
          title="Desktop only"
          messages={["Importing folders requires the native desktop app. The native picker and filesystem read are not available in the browser."]}
        />
      ) : null}
    </SectionCard>
  );
}
