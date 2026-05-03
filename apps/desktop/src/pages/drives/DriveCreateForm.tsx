import { type FormEvent, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// DriveFormState — shared shape for drive creation fields
// ---------------------------------------------------------------------------

export interface DriveFormState {
  volumeName: string;
  displayName: string;
  capacityTerabytes: string;
}

export const initialDriveForm: DriveFormState = {
  volumeName: "",
  displayName: "",
  capacityTerabytes: ""
};

// ---------------------------------------------------------------------------
// DriveCreateForm — extracted from DrivesPage.tsx
// ---------------------------------------------------------------------------

interface DriveCreateFormProps {
  form: DriveFormState;
  onChange: (next: DriveFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  isMutating: boolean;
}

export function DriveCreateForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  isMutating
}: DriveCreateFormProps) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <p className="h-section" style={{ marginBottom: 12 }}>Add manual drive</p>

      <form className="drive-form-grid" onSubmit={onSubmit}>
        <FormField label="Drive name" required>
          <input
            required
            value={form.volumeName}
            onChange={(e) => onChange({ ...form, volumeName: e.target.value })}
            className="field-shell w-full bg-transparent outline-none"
            placeholder="Archive Drive"
          />
        </FormField>
        <FormField label="Display name">
          <input
            value={form.displayName}
            onChange={(e) => onChange({ ...form, displayName: e.target.value })}
            className="field-shell w-full bg-transparent outline-none"
            placeholder="Studio Archive (optional)"
          />
        </FormField>
        <FormField label="Capacity (TB)">
          <input
            type="number"
            min="0"
            step="0.1"
            value={form.capacityTerabytes}
            onChange={(e) => onChange({ ...form, capacityTerabytes: e.target.value })}
            className="field-shell w-full bg-transparent outline-none"
            placeholder="4"
          />
        </FormField>

        <div className="form-actions flex items-center justify-end" style={{ gap: 8, paddingTop: 4 }}>
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            Discard
          </button>
          <button type="submit" className="btn btn-sm btn-primary" disabled={isMutating}>
            {isMutating ? "Saving…" : "Create drive"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FormField — internal helper, not exported
// ---------------------------------------------------------------------------

function FormField({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col" style={{ gap: 6 }}>
      <span className="eyebrow">
        {label}
        {required ? (
          <span style={{ marginLeft: 4, color: "var(--danger)" }}>
            *
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}
