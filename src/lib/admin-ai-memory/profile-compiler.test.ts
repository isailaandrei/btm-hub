import { describe, expect, it } from "vitest";
import { compileContactProfileFacts } from "./profile-compiler";
import type {
  CrmAiEvidenceChunkInput,
  CrmAiFactObservation,
} from "@/types/admin-ai-memory";
import type { Application, Contact } from "@/types/database";

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const APP_ID = "22222222-2222-4222-8222-222222222222";

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: CONTACT_ID,
    email: "joana@example.com",
    name: "Joana",
    phone: null,
    profile_id: null,
    created_at: "2026-04-15T00:00:00Z",
    updated_at: "2026-04-15T00:00:00Z",
    ...overrides,
  };
}

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: APP_ID,
    user_id: null,
    contact_id: CONTACT_ID,
    program: "filmmaking",
    status: "reviewing",
    answers: {},
    tags: [],
    admin_notes: [],
    submitted_at: "2026-04-10T00:00:00Z",
    updated_at: "2026-04-10T00:00:00Z",
    ...overrides,
  };
}

function makeChunk(
  overrides: Partial<CrmAiEvidenceChunkInput> = {},
): CrmAiEvidenceChunkInput {
  return {
    contactId: CONTACT_ID,
    applicationId: APP_ID,
    sourceType: "application_structured_field",
    logicalSourceId: `${APP_ID}:sf:budget`,
    sourceId: `${APP_ID}:sf:budget:v:budget-medium`,
    sourceTimestamp: "2026-04-10T00:00:00Z",
    text: "Application field: Budget. Candidate reports $2,000 - $5,000.",
    metadata: {
      fieldKey: "budget",
      fieldLabel: "Budget",
      normalizedValue: "$2,000 - $5,000",
      valueType: "string",
      sensitivity: "default",
      chunkClass: "structured_field",
      sourceLabel: "Budget",
      program: "filmmaking",
    },
    contentHash: "hash-1",
    chunkVersion: 1,
    ...overrides,
  };
}

function makeObservation(
  overrides: Partial<CrmAiFactObservation> = {},
): CrmAiFactObservation {
  return {
    id: "obs-1",
    contact_id: CONTACT_ID,
    observation_type: "application_field",
    field_key: "budget",
    value_type: "string",
    value_text: "$2,000 - $5,000",
    value_json: "$2,000 - $5,000",
    confidence: "high",
    source_chunk_ids: ["chunk-1"],
    source_timestamp: "2026-04-10T00:00:00Z",
    observed_at: "2026-04-10T00:00:00Z",
    invalidated_at: null,
    conflict_group: "application_field:budget",
    metadata_json: {
      fieldLabel: "Budget",
      sensitivity: "default",
    },
    created_at: "2026-04-10T00:00:00Z",
    ...overrides,
  };
}

describe("compileContactProfileFacts", () => {
  it("builds current structured/tag facts from current chunks", () => {
    const facts = compileContactProfileFacts({
      contact: makeContact(),
      applications: [makeApplication()],
      currentChunks: [
        makeChunk(),
        makeChunk({
          logicalSourceId: `${APP_ID}:sf:languages`,
          sourceId: `${APP_ID}:sf:languages:v:en-es`,
          text: "Application field: Languages. Candidate reports English, Spanish.",
          metadata: {
            fieldKey: "languages",
            fieldLabel: "Languages",
            normalizedValue: ["English", "Spanish"],
            valueType: "multiselect",
            sensitivity: "default",
            chunkClass: "structured_field",
            sourceLabel: "Languages",
            program: "filmmaking",
          },
        }),
        makeChunk({
          applicationId: null,
          sourceType: "contact_tag",
          logicalSourceId: `${CONTACT_ID}:tag:tag-1`,
          sourceId: `${CONTACT_ID}:tag:tag-1:v:conservation`,
          text: "CRM tag: Conservation.",
          metadata: {
            tagId: "tag-1",
            tagName: "Conservation",
            chunkClass: "tag",
            sourceLabel: "CRM tag",
          },
        }),
      ],
      observations: [makeObservation()],
    });

    expect(facts).toMatchObject({
      contact: {
        contactId: CONTACT_ID,
        contactName: "Joana",
        contactEmail: "joana@example.com",
      },
      applications: {
        applicationCount: 1,
        applicationIds: [APP_ID],
        programHistory: ["filmmaking"],
        statusHistory: ["reviewing"],
      },
      tags: {
        tagIds: ["tag-1"],
        tagNames: ["Conservation"],
      },
      structuredFieldDetails: {
        budget: {
          rawValues: ["$2,000 - $5,000"],
          normalizedValues: ["$2,000 - $5,000"],
        },
        languages: {
          rawValues: ["English, Spanish"],
          normalizedValues: ["English, Spanish"],
        },
      },
    });
    expect(facts).not.toHaveProperty("structuredFacts");
    expect(facts).not.toHaveProperty("allStructuredFieldValues");
  });

  it("surfaces field conflicts and tag history from observations", () => {
    const facts = compileContactProfileFacts({
      contact: makeContact(),
      applications: [makeApplication()],
      currentChunks: [
        makeChunk({
          logicalSourceId: `${APP_ID}:sf:age`,
          sourceId: `${APP_ID}:sf:age:v:25-34`,
          text: "Application field: Age Range. Candidate reports 27.",
          metadata: {
            fieldKey: "age",
            fieldLabel: "Age Range",
            displayValue: "27",
            normalizedValue: "25-34",
            valueType: "string",
            sensitivity: "sensitive",
            chunkClass: "structured_field",
            sourceLabel: "Age Range",
            program: "filmmaking",
          },
        }),
      ],
      observations: [
        makeObservation(),
        makeObservation({
          id: "obs-2",
          value_text: "$5,000+",
          value_json: "$5,000+",
          observed_at: "2026-04-18T00:00:00Z",
          source_timestamp: "2026-04-18T00:00:00Z",
          source_chunk_ids: ["chunk-2"],
        }),
        makeObservation({
          id: "obs-3",
          observation_type: "contact_tag",
          field_key: "tag",
          value_type: "tag",
          value_text: "Documentary",
          value_json: { tagId: "tag-2", tagName: "Documentary" },
          conflict_group: "contact_tag:tag-2",
          metadata_json: {
            tagId: "tag-2",
            tagName: "Documentary",
          },
        }),
        makeObservation({
          id: "obs-4",
          field_key: "age",
          value_text: "25-34",
          value_json: "25-34",
          conflict_group: "application_field:age",
          metadata_json: {
            fieldLabel: "Age Range",
            sensitivity: "sensitive",
          },
        }),
      ],
    });

    expect(facts).toMatchObject({
      structuredFieldDetails: {
        age: {
          rawValues: ["27"],
          normalizedValues: ["25-34"],
        },
      },
      observationSummary: {
        conflictingFields: ["budget"],
        fieldHistory: {
          budget: [
            expect.objectContaining({ valueText: "$5,000+" }),
            expect.objectContaining({ valueText: "$2,000 - $5,000" }),
          ],
          age: [expect.objectContaining({ valueText: "25-34" })],
        },
        tagHistory: [expect.objectContaining({ tagName: "Documentary" })],
      },
    });
  });
});
