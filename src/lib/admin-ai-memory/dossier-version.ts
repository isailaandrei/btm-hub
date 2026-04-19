/**
 * Version marker for the persisted dossier schema.
 *
 * This is intentionally separate from chunk normalization and prompt
 * generator versions:
 *   - `CHUNK_BUILDER_VERSION` tracks how raw CRM evidence is normalized.
 *   - `DOSSIER_GENERATOR_VERSION` tracks the model prompt / response shape.
 *   - `DOSSIER_SCHEMA_VERSION` tracks the persisted dossier contract that
 *     answer-time retrieval depends on.
 *
 * Bump this when stored dossier fields or anchor semantics change in a way
 * that should invalidate existing memory.
 */
export const DOSSIER_SCHEMA_VERSION = 2;
