import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Drive, Project } from "@drive-project-catalog/domain";
import { CommandPalette } from "./CommandPalette";
import { CommandPaletteProvider, useCommandPalette } from "./CommandPaletteContext";
import * as providers from "../providers";

// Mock useCatalogStore so CommandPalette doesn't need full AppProviders
vi.mock("../providers", () => ({
  useCatalogStore: vi.fn()
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

const EMPTY_STORE = { projects: [] as Project[], drives: [] as Drive[] };

function PaletteHarness() {
  return (
    <MemoryRouter>
      <CommandPaletteProvider>
        <CommandPalette />
      </CommandPaletteProvider>
    </MemoryRouter>
  );
}

function OpenButton() {
  const { open } = useCommandPalette();
  return (
    <button type="button" onClick={open}>
      open palette
    </button>
  );
}

describe("CommandPalette", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    vi.mocked(providers.useCatalogStore).mockReturnValue(
      EMPTY_STORE as unknown as ReturnType<typeof providers.useCatalogStore>
    );
  });

  it("renders closed by default", () => {
    render(<PaletteHarness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens when ⌘K is pressed on document", () => {
    render(<PaletteHarness />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes when Escape is pressed", () => {
    render(
      <MemoryRouter>
        <CommandPaletteProvider>
          <OpenButton />
          <CommandPalette />
        </CommandPaletteProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /open palette/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the 3 pinned action rows when open with no query", () => {
    render(<PaletteHarness />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    expect(screen.getByRole("button", { name: /register drive/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import folders/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open in finder/i })).toBeInTheDocument();
  });

  it("shows project results when query matches", () => {
    const project: Project = {
      id: "proj-1",
      folderName: "2026-03_Decathlon - Shoot",
      parsedClient: "Decathlon",
      parsedProject: "Shoot",
      parsedDate: "2026-03",
      correctedClient: null,
      correctedProject: null,
      correctedDate: null,
      currentDriveId: null,
      category: null,
      folderPath: null,
      folderType: "standard"
    } as unknown as Project;

    vi.mocked(providers.useCatalogStore).mockReturnValue({
      projects: [project],
      drives: []
    } as unknown as ReturnType<typeof providers.useCatalogStore>);

    render(<PaletteHarness />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    const input = screen.getByRole("textbox", { name: /command palette search/i });
    fireEvent.change(input, { target: { value: "dec" } });

    expect(screen.getByText(/projects/i)).toBeInTheDocument();
    // "Shoot" is the parsedProject which getDisplayProject returns
    expect(screen.getByText("Shoot")).toBeInTheDocument();
  });

  it("shows 'No results' state when query matches nothing", () => {
    render(<PaletteHarness />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    const input = screen.getByRole("textbox", { name: /command palette search/i });
    fireEvent.change(input, { target: { value: "zzzzz" } });

    expect(screen.getByText(/no results/i)).toBeInTheDocument();
  });

  it("throws when useCommandPalette is used outside the provider", () => {
    function NakedConsumer() {
      useCommandPalette();
      return null;
    }
    const consoleError = console.error;
    console.error = () => {};
    try {
      expect(() => render(<NakedConsumer />)).toThrow(/CommandPaletteProvider/);
    } finally {
      console.error = consoleError;
    }
  });
});
