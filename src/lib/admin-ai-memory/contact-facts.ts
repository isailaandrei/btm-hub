import type { ContactFactRow } from "@/types/admin-ai";
import type { Contact } from "@/types/database";

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function uniqueArrayValues(values: Array<string[] | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .flatMap((value) => value ?? [])
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  );
}

export function buildDossierContactFacts(input: {
  contact: Contact;
  factRows: ContactFactRow[];
  applicationCount: number;
}): Record<string, unknown> {
  const rows = input.factRows.filter(
    (row) => row.contact_id === input.contact.id,
  );

  const contactName =
    input.contact.name ??
    rows.find((row) => row.contact_name)?.contact_name ??
    null;
  const contactEmail =
    input.contact.email ??
    rows.find((row) => row.contact_email)?.contact_email ??
    null;
  const contactPhone =
    input.contact.phone ??
    rows.find((row) => row.contact_phone)?.contact_phone ??
    null;

  return {
    contact: {
      contactId: input.contact.id,
      contactName,
      contactEmail,
      contactPhone,
    },
    applications: {
      applicationCount: input.applicationCount,
      applicationIds: uniqueStrings(rows.map((row) => row.application_id)),
      programHistory: uniqueStrings(rows.map((row) => row.program)),
      statusHistory: uniqueStrings(rows.map((row) => row.status)),
    },
    tags: {
      tagIds: uniqueArrayValues(rows.map((row) => row.tag_ids)),
      tagNames: uniqueArrayValues(rows.map((row) => row.tag_names)),
    },
    structuredFacts: {
      budgetValues: uniqueStrings(rows.map((row) => row.budget)),
      timeAvailabilityValues: uniqueStrings(
        rows.map((row) => row.time_availability),
      ),
      startTimelineValues: uniqueStrings(
        rows.map((row) => row.start_timeline),
      ),
      btmCategoryValues: uniqueStrings(rows.map((row) => row.btm_category)),
      travelWillingnessValues: uniqueStrings(
        rows.map((row) => row.travel_willingness),
      ),
      languageValues: uniqueStrings(rows.map((row) => row.languages)),
      countryOfResidenceValues: uniqueStrings(
        rows.map((row) => row.country_of_residence),
      ),
      certificationLevelValues: uniqueStrings(
        rows.map((row) => row.certification_level),
      ),
      yearsExperienceValues: uniqueStrings(
        rows.map((row) => row.years_experience),
      ),
      involvementLevelValues: uniqueStrings(
        rows.map((row) => row.involvement_level),
      ),
    },
  };
}
