import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "@drive-project-catalog/ui";
import { useCommandPalette } from "./CommandPaletteContext";

interface PaletteAction {
  id: string;
  label: string;
  icon: IconName;
  onSelect: () => void;
}

const PINNED_ACTIONS: ReadonlyArray<PaletteAction> = [
  {
    id: "register-drive",
    label: "Register Drive",
    icon: "hardDrive",
    onSelect: () => {
      // TODO(02): wire to existing register-drive dialog opener
    }
  },
  {
    id: "import-folders",
    label: "Import Folders",
    icon: "folder",
    onSelect: () => {
      // TODO(02): wire to existing import-folders dialog opener
    }
  },
  {
    id: "open-in-finder",
    label: "Open in Finder",
    icon: "folderOpen",
    onSelect: () => {
      // TODO(02): wire to existing open-in-finder action
    }
  }
];

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm"
      style={{ paddingTop: "20vh" }}
      onClick={close}
    >
      <div
        className="w-[600px] max-w-[90vw] overflow-hidden rounded-xl border shadow-2xl"
        style={{
          background: "var(--color-surface)",
          borderColor: "var(--color-border)"
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex items-center gap-2 px-4 py-3 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <Icon name="search" size={16} />
          <input
            type="text"
            placeholder="Search projects, drives, or actions"
            autoFocus
            aria-label="Command palette search"
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: "var(--color-text)" }}
          />
        </div>
        <ul aria-label="Pinned actions" className="py-1">
          {PINNED_ACTIONS.map((action) => (
            <li key={action.id}>
              <button
                type="button"
                onClick={() => {
                  action.onSelect();
                  close();
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] hover:bg-white/5"
                style={{ color: "var(--color-text)" }}
              >
                <Icon name={action.icon} size={16} />
                <span>{action.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}
