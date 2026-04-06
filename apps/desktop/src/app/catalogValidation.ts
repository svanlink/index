import { getDriveCapacitySnapshot, type Category, type Drive, type Project } from "@drive-project-catalog/domain";

export interface ManualProjectFormValidationInput {
  parsedDate: string;
  parsedClient: string;
  parsedProject: string;
  category: Category | "";
  sizeGigabytes: string;
  currentDriveId: string;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export type BatchActionKind = "assign-drive" | "set-category" | "plan-move";

export interface BatchActionPreview extends ValidationResult {
  kind: BatchActionKind;
  title: string;
  summary: string;
  confirmations: string[];
}

export function validateManualProjectForm(input: ManualProjectFormValidationInput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const parsedDate = input.parsedDate.trim();
  const parsedClient = input.parsedClient.trim();
  const parsedProject = input.parsedProject.trim();

  if (!/^\d{6}$/.test(parsedDate)) {
    errors.push("Date must use the YYMMDD format.");
  } else if (!isValidParsedDate(parsedDate)) {
    errors.push("Date must be a real calendar date.");
  }

  if (!parsedClient) {
    errors.push("Client is required.");
  }
  if (!parsedProject) {
    errors.push("Project is required.");
  }
  if (!input.category) {
    errors.push("Choose a category before creating the project.");
  }

  if (input.sizeGigabytes) {
    const size = Number(input.sizeGigabytes);
    if (!Number.isFinite(size) || size < 0) {
      errors.push("Size must be a positive number.");
    }
  } else {
    warnings.push("No size entered. The project will be created with unknown size.");
  }

  if (!input.currentDriveId) {
    warnings.push("No drive selected. The project will be created as unassigned.");
  }

  return { errors, warnings };
}

export function buildBatchActionPreview(params: {
  kind: BatchActionKind;
  selectedProjects: Project[];
  drives: Drive[];
  assignDriveId?: string | null;
  category?: Category | "";
  targetDriveId?: string | null;
}): BatchActionPreview {
  const { kind, selectedProjects, drives } = params;
  const errors: string[] = [];
  const warnings: string[] = [];
  const confirmations: string[] = [];

  if (selectedProjects.length === 0) {
    errors.push("Select at least one project before applying a batch action.");
  }

  if (kind === "assign-drive") {
    const nextDrive = params.assignDriveId ? drives.find((drive) => drive.id === params.assignDriveId) ?? null : null;
    const movePendingCount = selectedProjects.filter((project) => project.moveStatus === "pending").length;
    const unassignedCount = selectedProjects.filter((project) => project.currentDriveId === null).length;

    if (movePendingCount > 0) {
      warnings.push(`${movePendingCount} selected project${pluralize(movePendingCount)} will clear pending move state when assigned directly.`);
    }
    if (nextDrive) {
      confirmations.push(`${selectedProjects.length} selected project${pluralize(selectedProjects.length)} will end up on ${nextDrive.displayName} as the current drive.`);
      if (unassignedCount > 0) {
        confirmations.push(`${unassignedCount} unassigned project${pluralize(unassignedCount)} will become assigned.`);
      }
    } else {
      confirmations.push(`${selectedProjects.length} selected project${pluralize(selectedProjects.length)} will become unassigned.`);
    }

    return {
      kind,
      title: "Confirm drive assignment",
      summary: nextDrive
        ? `Assign ${selectedProjects.length} selected project${pluralize(selectedProjects.length)} directly to ${nextDrive.displayName}.`
        : `Clear the current drive assignment for ${selectedProjects.length} selected project${pluralize(selectedProjects.length)}.`,
      errors,
      warnings,
      confirmations
    };
  }

  if (kind === "set-category") {
    if (!params.category) {
      errors.push("Choose a category before applying the batch category update.");
    } else {
      confirmations.push(`${selectedProjects.length} selected project${pluralize(selectedProjects.length)} will use the ${params.category} category.`);
    }

    return {
      kind,
      title: "Confirm category update",
      summary: `Update the category for ${selectedProjects.length} selected project${pluralize(selectedProjects.length)}.`,
      errors,
      warnings,
      confirmations
    };
  }

  const targetDrive = params.targetDriveId ? drives.find((drive) => drive.id === params.targetDriveId) ?? null : null;
  if (!targetDrive) {
    errors.push("Choose a target drive before planning a batch move.");
  }

  const sameDriveCount = targetDrive
    ? selectedProjects.filter((project) => project.currentDriveId === targetDrive.id).length
    : 0;
  if (sameDriveCount > 0) {
    errors.push(`${sameDriveCount} selected project${pluralize(sameDriveCount)} already use${sameDriveCount === 1 ? "s" : ""} the chosen drive as the current drive.`);
  }

  const unknownSizeCount = selectedProjects.filter((project) => project.sizeBytes === null).length;
  if (unknownSizeCount > 0) {
    warnings.push(`${unknownSizeCount} selected project${pluralize(unknownSizeCount)} have unknown size, so final reserved impact cannot be guaranteed.`);
  }

  if (targetDrive) {
    const capacity = getDriveCapacitySnapshot(targetDrive, selectedProjects);
    const knownIncomingBytes = selectedProjects.reduce((total, project) => total + (project.sizeBytes ?? 0), 0);
    const availableBytes = capacity.remainingFreeBytes;

    if (availableBytes !== null && knownIncomingBytes > availableBytes) {
      warnings.push(`Known selected project size exceeds currently available free space on ${targetDrive.displayName}.`);
    }

    confirmations.push(`${selectedProjects.length} selected project${pluralize(selectedProjects.length)} will reserve incoming space on ${targetDrive.displayName}.`);
  }

  return {
    kind,
    title: "Confirm move planning",
    summary: targetDrive
      ? `Plan moves for ${selectedProjects.length} selected project${pluralize(selectedProjects.length)} to ${targetDrive.displayName}.`
      : `Plan moves for ${selectedProjects.length} selected project${pluralize(selectedProjects.length)}.`,
    errors,
    warnings,
    confirmations
  };
}

export function validateSingleProjectMove(params: {
  project: Project;
  targetDriveId: string;
  drives: Drive[];
  allProjects: Project[];
}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const targetDrive = params.drives.find((drive) => drive.id === params.targetDriveId) ?? null;

  if (!params.targetDriveId) {
    errors.push("Choose a target drive before planning the move.");
    return { errors, warnings };
  }

  if (!targetDrive) {
    errors.push("The selected target drive could not be found.");
    return { errors, warnings };
  }

  if (params.project.currentDriveId === targetDrive.id) {
    errors.push("The target drive matches the current drive.");
  }

  const capacity = getDriveCapacitySnapshot(targetDrive, params.allProjects);
  if (params.project.sizeBytes === null) {
    warnings.push("This project has unknown size, so final reserved impact cannot be guaranteed.");
  } else if (capacity.remainingFreeBytes !== null && params.project.sizeBytes > capacity.remainingFreeBytes) {
    warnings.push(`The target drive appears to have insufficient remaining free space for this project.`);
  }

  if (params.project.targetDriveId && params.project.targetDriveId !== targetDrive.id) {
    warnings.push("This will replace the existing pending move target.");
  }

  return { errors, warnings };
}

function isValidParsedDate(value: string) {
  const year = Number(`20${value.slice(0, 2)}`);
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function pluralize(count: number) {
  return count === 1 ? "" : "s";
}
