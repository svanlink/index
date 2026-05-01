import type { MouseEvent as ReactMouseEvent } from "react";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, type MenuItemOptions, type PredefinedMenuItemOptions } from "@tauri-apps/api/menu";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";

export type NativeContextMenuItem =
  | {
      text: string;
      enabled?: boolean;
      action(): void;
    }
  | {
      separator: true;
    };

type NativeMenuOption = MenuItemOptions | PredefinedMenuItemOptions;

function isTauriRuntimeAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function toNativeMenuOption(item: NativeContextMenuItem): NativeMenuOption {
  if ("separator" in item) {
    return { item: "Separator" };
  }
  return {
    text: item.text,
    enabled: item.enabled ?? true,
    action: () => item.action()
  };
}

export async function showNativeContextMenu(
  event: ReactMouseEvent<HTMLElement>,
  items: NativeContextMenuItem[]
): Promise<boolean> {
  event.preventDefault();
  event.stopPropagation();

  if (!isTauriRuntimeAvailable() || items.length === 0) {
    return false;
  }

  let menu: Menu | null = null;
  try {
    menu = await Menu.new({ items: items.map(toNativeMenuOption) });
    await menu.popup(new LogicalPosition(event.clientX, event.clientY));
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[native-context-menu] menu unavailable", error);
    return false;
  } finally {
    await menu?.close().catch(() => undefined);
  }
}

export async function copyTextToClipboard(text: string): Promise<void> {
  const normalized = text.trim();
  if (!normalized) return;

  try {
    await navigator.clipboard.writeText(normalized);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = normalized;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

export async function openPathInFinder(path: string | null | undefined): Promise<void> {
  const normalized = path?.trim();
  if (!normalized || !isTauriRuntimeAvailable()) return;

  try {
    await openPath(normalized);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[finder] open path unavailable", error);
  }
}

export async function showPathInFinder(path: string | null | undefined): Promise<void> {
  const normalized = path?.trim();
  if (!normalized || !isTauriRuntimeAvailable()) return;

  try {
    await revealItemInDir(normalized);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[finder] reveal path unavailable", error);
  }
}
