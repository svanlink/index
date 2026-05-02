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
    <div className="card p-4">
      <p className="h-section mb-3">Add manual drive</p>

      <form className="grid gap-4 md:grid-cols-3" onSubmit={onSubmit}>
        <FormField label="Drive name" required>
          <input
            required
            value={form.volumeName}
            onChange={(e) => onChange({ ...form, volumeName: e.target.value })}
            className="field-shell w-full bg-transparent px-3 py-2 outline-none"
            placeholder="Archive Drive"
          />
        </FormField>
        <FormField label="Display name">
          <input
            value={form.displayName}
            onChange={(e) => onChange({ ...form, displayName: e.target.value })}
            className="field-shell w-full bg-transparent px-3 py-2 outline-none"
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
            className="field-shell w-full bg-transparent px-3 py-2 outline-none"
            placeholder="4"
          />
        </FormField>

        <div className="flex items-center justify-end gap-2 pt-1 md:col-span-3">
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
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow">
        {label}
        {required ? (
          <span className="ml-1" style={{ color: "var(--danger)" }}>
            *
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}
