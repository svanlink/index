import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GenerateRenameSuggestionsResult } from "@drive-project-catalog/data";
import { classifyFolderName, type RenameSuggestion } from "@drive-project-catalog/domain";
import { Icon } from "@drive-project-catalog/ui";
import { useCatalogStore } from "../app/providers";
import { renameProjectFolder } from "../app/renameCommands";
import { FeedbackNotice } from "./pagePrimitives";

/**
 * Tracks the most recent undoable mutation so the toolbar can surface a
 * one-click "Undo" button right after an approve/dismiss. We keep both the
 * folder name and the action verb so the feedback message can read like a
 * sentence ("Approved 2024-01-12_Acme_Pitch — Undo?").
 */
interface UndoableAction {
  suggestionId: string;
  folderName: string;
  action: "approved" | "dismissed";
}

// ---------------------------------------------------------------------------
// RenamePage — Phase 3: Smart Rename review surface (DESIGN.md §7)
//
// Shows every pending rename suggestion produced by the smart rename engine.
// The user renames or dismisses each one individually. Rename performs a
// native same-parent folder rename, then updates the catalog row.
//
// Layout:
//   Eyebrow + title + subtitle
//   Hairline divider
//   Action bar — live search input (left) / Generate button (right)
//   Pending suggestion rows — flat list, hover fill, mono folder names
//   Empty state — centered with icon when no pending suggestions exist
//   No-results state — when search query matches nothing
//   Feedback notice — success / error banners after mutations
// ---------------------------------------------------------------------------

type NoticeTone = "success" | "warning" | "error" | "info";

interface FeedbackState {
  tone: NoticeTone;
  title: string;
  messages: string[];
}

/** Map confidence level → chip CSS class from DESIGN.md §6.StatusBadge */
const CONFIDENCE_CHIP: Record<RenameSuggestion["confidence"], string> = {
  high: "chip chip-ok",
  medium: "chip chip-ghost",
  low: "chip chip-warn"
};

const CONFIDENCE_LABEL: Record<RenameSuggestion["confidence"], string> = {
  high: "High",
  medium: "Medium",
  low: "Low"
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RenamePage() {
  const { repository, refresh } = useCatalogStore();

  const [suggestions, setSuggestions] = useState<RenameSuggestion[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [lastUndoable, setLastUndoable] = useState<UndoableAction | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [confirmingSuggestion, setConfirmingSuggestion] = useState<RenameSuggestion | null>(null);
  const [draftSuggestedNames, setDraftSuggestedNames] = useState<Record<string, string>>({});

  const searchRef = useRef<HTMLInputElement>(null);

  /** Filter suggestions in-memory — substring match on currentName, suggestedName, and reason. */
  const filteredSuggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return suggestions;
    return suggestions.filter((s) =>
      `${s.currentName} ${s.suggestedName} ${s.reason}`.toLowerCase().includes(query)
    );
  }, [suggestions, search]);

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------

  const loadSuggestions = useCallback(async () => {
    const all = await repository.listRenameSuggestions();
    const pending = all.filter((s) => s.status === "pending");
    setSuggestions(pending);
    setDraftSuggestedNames((current) => {
      const next: Record<string, string> = {};
      for (const suggestion of pending) {
        next[suggestion.id] = current[suggestion.id] ?? suggestion.suggestedName;
      }
      return next;
    });
  }, [repository]);

  useEffect(() => {
    setIsLoading(true);
    void loadSuggestions().finally(() => setIsLoading(false));
  }, [loadSuggestions]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleGenerate() {
    setIsGenerating(true);
    setFeedback(null);
    try {
      const result: GenerateRenameSuggestionsResult = await repository.generateRenameSuggestions();
      await loadSuggestions();

      const messages: string[] = [];
      if (result.newSuggestionsCount > 0) {
        messages.push(
          `${result.newSuggestionsCount} new suggestion${result.newSuggestionsCount === 1 ? "" : "s"} found.`
        );
      }
      if (result.skippedAlreadySuggestedCount > 0) {
        messages.push(
          `${result.skippedAlreadySuggestedCount} project${result.skippedAlreadySuggestedCount === 1 ? "" : "s"} already had a pending suggestion and were skipped.`
        );
      }

      setFeedback({
        tone: result.newSuggestionsCount > 0 ? "success" : "info",
        title:
          result.newSuggestionsCount > 0
            ? "Suggestions generated"
            : `${result.examinedCount} project${result.examinedCount === 1 ? "" : "s"} examined — nothing new to suggest.`,
        messages
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Could not generate suggestions",
        messages: [error instanceof Error ? error.message : "An unexpected error occurred."]
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRename(target: RenameSuggestion) {
    if (!target) return;
    const suggestedName = target.suggestedName.trim();
    if (!suggestedName) {
      setFeedback({
        tone: "error",
        title: "Suggested name is empty",
        messages: ["Type a valid folder name before renaming."]
      });
      return;
    }
    setActingOn(target.id);
    try {
      const project = await repository.getProjectById(target.projectId);
      if (!project) {
        throw new Error("The project for this suggestion no longer exists.");
      }
      if (!project.folderPath) {
        throw new Error("This project has no on-disk folder path to rename.");
      }

      const result = await renameProjectFolder(project.folderPath, suggestedName);
      const classification = classifyFolderName(result.folderName);
      await repository.saveProject({
        ...project,
        folderName: result.folderName,
        folderPath: result.renamedPath,
        folderType: classification.folderType,
        parsedDate: classification.parsedDate,
        parsedClient: classification.parsedClient,
        parsedProject: classification.parsedProject,
        normalizedName: classification.normalizedName,
        namingConfidence: classification.namingConfidence,
        namingStatus: classification.namingStatus,
        isStandardized: classification.namingStatus === "valid",
        updatedAt: new Date().toISOString()
      });
      await repository.updateRenameSuggestionStatus(target.id, "approved");
      await refresh();
      setSuggestions((prev) => prev.filter((s) => s.id !== target.id));
      setDraftSuggestedNames((prev) => {
        const next = { ...prev };
        delete next[target.id];
        return next;
      });
      setConfirmingSuggestion(null);
      setLastUndoable(null);
      setFeedback({
        tone: "success",
        title: "Folder renamed",
        messages: [`${target.currentName} → ${result.folderName}`]
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Could not rename folder",
        messages: [error instanceof Error ? error.message : "An unexpected error occurred."]
      });
    } finally {
      setActingOn(null);
    }
  }

  async function handleDismiss(id: string) {
    const target = suggestions.find((s) => s.id === id);
    setActingOn(id);
    try {
      await repository.updateRenameSuggestionStatus(id, "dismissed");
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      setLastUndoable({
        suggestionId: id,
        folderName: target?.currentName ?? "suggestion",
        action: "dismissed"
      });
      setFeedback(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Could not dismiss suggestion",
        messages: [error instanceof Error ? error.message : "An unexpected error occurred."]
      });
    } finally {
      setActingOn(null);
    }
  }

  async function handleUndo() {
    if (!lastUndoable || isUndoing) return;
    setIsUndoing(true);
    try {
      const result = await repository.undoLastRenameOperation();
      if (!result) {
        setFeedback({
          tone: "info",
          title: "Nothing to undo",
          messages: ["The undo history is empty."]
        });
        setLastUndoable(null);
        return;
      }
      // Reload from the source of truth so the suggestion reappears in the
      // pending list (or is removed, if undo restored it to a non-pending state).
      await loadSuggestions();
      setFeedback({
        tone: "success",
        title: `Undid ${lastUndoable.action === "approved" ? "approve" : "dismiss"} on ${lastUndoable.folderName}`,
        messages: ["The suggestion is back in the pending list."]
      });
      setLastUndoable(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Undo failed",
        messages: [error instanceof Error ? error.message : "An unexpected error occurred."]
      });
    } finally {
      setIsUndoing(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div>
      <h1 className="sr-only">Rename Review</h1>

      {confirmingSuggestion ? (
        <RenameConfirmModal
          suggestion={confirmingSuggestion}
          isBusy={actingOn === confirmingSuggestion.id}
          onCancel={() => setConfirmingSuggestion(null)}
          onConfirm={() => void handleRename(confirmingSuggestion)}
        />
      ) : null}

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="pb-5" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <p className="eyebrow mb-1">Smart Rename</p>
        <h2 className="h-title" style={{ marginBottom: 6 }}>
          Rename Review
        </h2>
        <p style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.5, maxWidth: 540 }}>
          Folders whose names don't match the{" "}
          <span
            className="mono"
            style={{
              fontSize: 12,
              background: "var(--surface-container-low)",
              border: "1px solid var(--hairline)",
              borderRadius: "var(--radius)",
              padding: "1px 5px"
            }}
          >
            YYYY-MM-DD_Client - Project
          </span>{" "}
          convention are listed here. Rename applies the change on disk; dismiss skips it.
        </p>
      </div>

      {/* ── Action bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-4 pb-2">
        {/* Live search/filter */}
        <div
          className="field"
          style={{ display: "flex", flex: 1, maxWidth: 400, gap: 8 }}
        >
          <Icon name="search" size={14} color="var(--ink-4)" style={{ flexShrink: 0 }} />
          <input
            ref={searchRef}
            type="search"
            placeholder="Filter by folder name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={isLoading}
            aria-label="Filter suggestions"
            style={{
              flex: 1,
              minWidth: 0,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 14,
              color: "var(--ink)"
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                searchRef.current?.focus();
              }}
              aria-label="Clear filter"
              style={{
                flexShrink: 0,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--ink-4)",
                display: "flex",
                alignItems: "center"
              }}
            >
              <Icon name="close" size={13} color="var(--ink-4)" />
            </button>
          )}
        </div>

        {/* Undo — only visible immediately after a successful approve/dismiss */}
        {lastUndoable && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void handleUndo()}
            disabled={isUndoing}
            title={`Undo ${lastUndoable.action} on ${lastUndoable.folderName}`}
            aria-label={`Undo last ${lastUndoable.action}`}
            style={{ flexShrink: 0 }}
          >
            <Icon name="arrowRight" size={14} color="currentColor" style={{ transform: "scaleX(-1)" }} />
            {isUndoing ? "Undoing…" : "Undo"}
          </button>
        )}

        {/* Generate */}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handleGenerate()}
          disabled={isGenerating || isLoading}
        >
          {isGenerating ? (
            <>
              <span
                className="spin"
                style={{
                  display: "inline-block",
                  width: 14,
                  height: 14,
                  border: "2px solid rgba(255,255,255,0.35)",
                  borderTopColor: "#fff",
                  borderRadius: "50%"
                }}
                aria-hidden="true"
              />
              Scanning…
            </>
          ) : (
            <>
              <Icon name="sparkle" size={15} />
              Generate suggestions
            </>
          )}
        </button>
      </div>

      {/* ── Feedback notice ─────────────────────────────────────────────── */}
      {feedback && (
        <div className="mt-5">
          <FeedbackNotice
            tone={feedback.tone}
            title={feedback.title}
            messages={feedback.messages}
          />
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : suggestions.length === 0 ? (
        <EmptyState />
      ) : filteredSuggestions.length === 0 ? (
        <NoSearchResults query={search} />
      ) : (
        <SuggestionList
          suggestions={filteredSuggestions}
          totalCount={suggestions.length}
          actingOn={actingOn}
          draftSuggestedNames={draftSuggestedNames}
          onDraftSuggestedNameChange={(id, value) =>
            setDraftSuggestedNames((prev) => ({ ...prev, [id]: value }))
          }
          onRename={(suggestion) =>
            setConfirmingSuggestion({
              ...suggestion,
              suggestedName: (draftSuggestedNames[suggestion.id] ?? suggestion.suggestedName).trim()
            })
          }
          onDismiss={handleDismiss}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="mt-4" aria-live="polite" aria-busy="true">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 py-4"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <div
            className="skeleton"
            style={{ height: 14, width: "30%", borderRadius: "var(--radius)" }}
          />
          <div className="skeleton" style={{ height: 14, width: 18, borderRadius: 2 }} />
          <div
            className="skeleton"
            style={{ height: 14, width: "34%", borderRadius: "var(--radius)" }}
          />
          <div
            className="skeleton"
            style={{ height: 20, width: 52, borderRadius: "var(--radius-full)", marginLeft: "auto" }}
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center fade-in"
      style={{ paddingTop: 80, paddingBottom: 80, gap: 16, textAlign: "center" }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "var(--radius-xl)",
          background: "var(--surface-container-low)",
          border: "1px solid var(--hairline)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Icon name="edit" size={22} color="var(--ink-4)" />
      </div>
      <div>
        <p
          style={{
            fontSize: 17,
            fontWeight: 500,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
            marginBottom: 6
          }}
        >
          No pending suggestions
        </p>
        <p style={{ fontSize: 14, color: "var(--ink-3)", maxWidth: 340, lineHeight: 1.5 }}>
          Click <strong style={{ color: "var(--ink-2)", fontWeight: 500 }}>Generate suggestions</strong>{" "}
          to scan your projects and find folders that can be standardised.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// No search results
// ---------------------------------------------------------------------------

function NoSearchResults({ query }: { query: string }) {
  return (
    <div
      className="flex flex-col items-center fade-in"
      style={{ paddingTop: 80, paddingBottom: 80, gap: 16, textAlign: "center" }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "var(--radius-xl)",
          background: "var(--surface-container-low)",
          border: "1px solid var(--hairline)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Icon name="search" size={22} color="var(--ink-4)" />
      </div>
      <div>
        <p
          style={{
            fontSize: 17,
            fontWeight: 500,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
            marginBottom: 6
          }}
        >
          No matches
        </p>
        <p style={{ fontSize: 14, color: "var(--ink-3)", maxWidth: 340, lineHeight: 1.5 }}>
          No suggestions match{" "}
          <strong style={{ color: "var(--ink-2)", fontWeight: 500 }}>"{query.trim()}"</strong>.
          Try a different search term or clear the filter.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suggestion list
// ---------------------------------------------------------------------------

interface SuggestionListProps {
  suggestions: RenameSuggestion[];
  totalCount: number;
  actingOn: string | null;
  draftSuggestedNames: Record<string, string>;
  onDraftSuggestedNameChange(id: string, value: string): void;
  onRename(suggestion: RenameSuggestion): void;
  onDismiss(id: string): void;
}

function SuggestionList({
  suggestions,
  totalCount,
  actingOn,
  draftSuggestedNames,
  onDraftSuggestedNameChange,
  onRename,
  onDismiss
}: SuggestionListProps) {
  return (
    <div className="scale-in">
      {/* Column headers */}
      <div
        className="flex items-center gap-3 py-2 px-3"
        style={{ borderBottom: "1px solid var(--hairline)", marginTop: 8 }}
      >
        <span className="eyebrow flex-1" style={{ minWidth: 0 }}>
          Current name
        </span>
        <span style={{ width: 18 }} />
        <span className="eyebrow flex-1" style={{ minWidth: 0 }}>
          Suggested name
        </span>
        <span className="eyebrow" style={{ width: 72, textAlign: "center" }}>
          Confidence
        </span>
        <span style={{ width: 148 }} aria-hidden="true" />
      </div>

      {/* Rows */}
      <ul role="list" style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {suggestions.map((s) => (
          <SuggestionRow
            key={s.id}
            suggestion={s}
            isBusy={actingOn === s.id}
            draftSuggestedName={draftSuggestedNames[s.id] ?? s.suggestedName}
            onDraftSuggestedNameChange={(value) => onDraftSuggestedNameChange(s.id, value)}
            onRename={onRename}
            onDismiss={onDismiss}
          />
        ))}
      </ul>

      {/* Footer count */}
      <div
        className="flex items-center justify-between pt-4"
        style={{ borderTop: "1px solid var(--hairline)", marginTop: 0 }}
      >
        <span style={{ fontSize: 13, color: "var(--ink-4)", fontVariantNumeric: "tabular-nums" }}>
          {suggestions.length < totalCount
            ? `${suggestions.length} of ${totalCount} pending suggestion${totalCount === 1 ? "" : "s"}`
            : `${totalCount} pending suggestion${totalCount === 1 ? "" : "s"}`}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual suggestion row
// ---------------------------------------------------------------------------

interface SuggestionRowProps {
  suggestion: RenameSuggestion;
  isBusy: boolean;
  draftSuggestedName: string;
  onDraftSuggestedNameChange(value: string): void;
  onRename(suggestion: RenameSuggestion): void;
  onDismiss(id: string): void;
}

function SuggestionRow({
  suggestion: s,
  isBusy,
  draftSuggestedName,
  onDraftSuggestedNameChange,
  onRename,
  onDismiss
}: SuggestionRowProps) {
  return (
    <li
      style={{
        borderBottom: "1px solid var(--hairline)",
        opacity: isBusy ? 0.5 : 1,
        transition: "opacity 150ms"
      }}
    >
      <div
        className="flex items-center gap-3 py-3 px-3"
        style={{
          borderRadius: "var(--radius-lg)",
          transition: "background 100ms"
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--surface-container-low)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "";
        }}
      >
        {/* Current name */}
        <div
          className="mono flex-1 min-w-0"
          style={{
            fontSize: 13,
            color: "var(--ink-3)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
          title={s.currentName}
        >
          {s.currentName}
        </div>

        {/* Arrow */}
        <div style={{ flexShrink: 0, color: "var(--ink-4)", display: "flex" }}>
          <Icon name="arrowRight" size={14} color="var(--ink-4)" />
        </div>

        {/* Suggested name */}
        <input
          className="mono flex-1 min-w-0"
          value={draftSuggestedName}
          onChange={(event) => onDraftSuggestedNameChange(event.target.value)}
          disabled={isBusy}
          aria-label={`Suggested name for ${s.currentName}`}
          style={{
            fontSize: 13,
            color: "var(--action)",
            fontWeight: 500,
            minWidth: 0,
            height: 32,
            border: "1px solid var(--hairline)",
            borderRadius: "var(--radius)",
            background: "var(--surface)",
            padding: "0 8px",
            outline: "none"
          }}
          title={`${draftSuggestedName}\n\n${s.reason}`}
        />

        {/* Confidence chip */}
        <div style={{ width: 72, display: "flex", justifyContent: "center", flexShrink: 0 }}>
          <span className={CONFIDENCE_CHIP[s.confidence]}>
            {CONFIDENCE_LABEL[s.confidence]}
          </span>
        </div>

        {/* Actions */}
        <div
          className="flex items-center gap-2"
          style={{ width: 148, flexShrink: 0, justifyContent: "flex-end" }}
        >
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => onRename({ ...s, suggestedName: draftSuggestedName })}
            disabled={isBusy || draftSuggestedName.trim().length === 0}
            aria-label={`Rename folder for ${s.currentName}`}
          >
            Rename
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => onDismiss(s.id)}
            disabled={isBusy}
            aria-label={`Dismiss rename for ${s.currentName}`}
          >
            Dismiss
          </button>
        </div>
      </div>
    </li>
  );
}

function RenameConfirmModal({
  suggestion,
  isBusy,
  onCancel,
  onConfirm
}: {
  suggestion: RenameSuggestion;
  isBusy: boolean;
  onCancel(): void;
  onConfirm(): void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-confirm-title"
    >
      <div className="card w-full max-w-[620px] overflow-hidden bg-[color:var(--surface)] shadow-[var(--sh-pop)]">
        <div className="border-b px-5 py-4" style={{ borderColor: "var(--hairline)" }}>
          <h2 id="rename-confirm-title" className="h-section" style={{ margin: 0 }}>
            Rename folder on disk?
          </h2>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--ink-3)", marginBottom: 0 }}>
            This will rename the real folder in Finder and update the catalog path.
          </p>
        </div>

        <div className="space-y-4 px-5 py-5">
          <RenamePreviewField label="Current" value={suggestion.currentName} muted />
          <RenamePreviewField label="New" value={suggestion.suggestedName} />
          <div
            className="rounded-[8px] border px-3 py-2 text-[12.5px]"
            style={{
              borderColor: "var(--color-border-warning)",
              background: "var(--warn-soft)",
              color: "var(--ink-2)"
            }}
          >
            This action does not have physical undo yet. If the destination name already exists, the app will stop before renaming.
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-2 border-t px-5 py-4"
          style={{ borderColor: "var(--hairline)" }}
        >
          <button type="button" className="btn btn-sm" onClick={onCancel} disabled={isBusy}>
            Cancel
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={onConfirm} disabled={isBusy}>
            {isBusy ? "Renaming..." : "Rename folder"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RenamePreviewField({
  label,
  value,
  muted
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="eyebrow mb-1">{label}</div>
      <div
        className="mono rounded-[8px] border px-3 py-2 text-[13px]"
        style={{
          borderColor: "var(--hairline)",
          background: muted ? "var(--surface-container-low)" : "var(--accent-soft)",
          color: muted ? "var(--ink-3)" : "var(--accent-ink)"
        }}
      >
        {value}
      </div>
    </div>
  );
}
