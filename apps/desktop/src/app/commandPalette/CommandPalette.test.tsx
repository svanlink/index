import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommandPalette } from "./CommandPalette";
import { CommandPaletteProvider, useCommandPalette } from "./CommandPaletteContext";

function PaletteHarness() {
  return (
    <CommandPaletteProvider>
      <CommandPalette />
    </CommandPaletteProvider>
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
      <CommandPaletteProvider>
        <OpenButton />
        <CommandPalette />
      </CommandPaletteProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /open palette/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the 3 pinned action rows when open", () => {
    render(<PaletteHarness />);

    fireEvent.keyDown(document, { key: "k", metaKey: true });

    expect(screen.getByRole("button", { name: /register drive/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import folders/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open in finder/i })).toBeInTheDocument();
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
