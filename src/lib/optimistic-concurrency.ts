export class VersionConflictError extends Error {
  readonly code = "version_conflict";

  constructor(recordLabel = "record") {
    super(
      `This ${recordLabel} was updated by another admin before your change was saved.`,
    );
    this.name = "VersionConflictError";
  }
}
