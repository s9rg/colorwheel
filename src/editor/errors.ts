export class EditorStateError extends Error {
  override readonly name: string = "EditorStateError";
}

export class DuplicateColorIdError extends EditorStateError {
  override readonly name = "DuplicateColorIdError";

  constructor(readonly colorId: string) {
    super(`Palette color IDs must be unique; received duplicate ID "${colorId}"`);
  }
}

export class UnknownColorIdError extends EditorStateError {
  override readonly name = "UnknownColorIdError";

  constructor(readonly colorId: string) {
    super(`Palette does not contain a color with ID "${colorId}"`);
  }
}

export class LinkedInteractionError extends EditorStateError {
  override readonly name = "LinkedInteractionError";
}

export class LockedColorConstraintError extends EditorStateError {
  override readonly name = "LockedColorConstraintError";

  constructor(readonly colorId: string) {
    super(`Regeneration must preserve locked color "${colorId}"`);
  }
}

export class MissingRegeneratorError extends EditorStateError {
  override readonly name = "MissingRegeneratorError";

  constructor() {
    super("This palette recipe needs a configured regeneration strategy");
  }
}

export class DestroyedPickerControllerError extends EditorStateError {
  override readonly name = "DestroyedPickerControllerError";

  constructor() {
    super("The picker controller has been destroyed");
  }
}
