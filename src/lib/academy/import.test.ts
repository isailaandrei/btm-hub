import { describe, expect, it } from "vitest";

import {
  normalizeImportAnswers,
  parseAcademyImportCsv,
  splitMultiselectValue,
} from "./import";

describe("splitMultiselectValue", () => {
  it("preserves commas inside parentheses", () => {
    expect(
      splitMultiselectValue("Social Media (Instagram, Facebook, etc.), Word of mouth"),
    ).toEqual([
      "Social Media (Instagram, Facebook, etc.)",
      "Word of mouth",
    ]);
  });
});

describe("normalizeImportAnswers", () => {
  it("applies the known legacy typo fixes before validation", () => {
    expect(
      normalizeImportAnswers("photography", {
        age: "54+",
        time_availability:
          "2-3 entire weeks at a time for a workshop, aproject or individual training",
        income_from_photography: "No, thats not my goal.",
      }),
    ).toEqual({
      age: "55+",
      time_availability:
        "2-3 entire weeks at a time for a workshop, a project or individual training",
      income_from_photography: "No, that's not my goal.",
    });
  });
});

describe("parseAcademyImportCsv", () => {
  it("maps internship rows to the current application field names", () => {
    const csv = [
      "Zeitstempel,First Name,Last Name,Nickname,Email,Phone,Age,Gender,Nationality,Country of residence,Languages,\"If you have an online presence, please share your links.\",\"Do you already have accommodation, connections, or other ties to Faial, Azores?\",Current occupation,What is the highest level of education or training you have completed so far?,\"What is your field of study, training or profession?\",\"Which activities (like jobs, studies, school, time-intensive interests) have primarily occupied your time over the past few years?\",Experience with underwater filmmaking so far,List your filming equipment,What type of content have you created so far? ,What inspired you to apply to BTM Academy? ,Please describe your ultimate vision for your underwater filming journey ,What do you hope to gain from this internship?,Why do you think you are a good candidate for the internship?,Physical Fitness & Health,Do you have any specific health conditions that might affect diving?,What type of diving do you practice?,Current diving certification level,Number of dives,Last diving activity date,Diving environments experience,How would you describe your buoyancy skill level,How did you hear about BTM Academy? ,Do you have any specific questions or concerns?,Is there anything else you'd like to share with us?",
      "21.01.2026 21:03:43,Max,Schneider,,max@example.com,+491234,29,Male,German,Germany,\"English, German\",https://instagram.com/max,\"No, I haven't.\",Event manager,Bachelor's degree,Event management,\"Work, diving, photography\",Beginner,\"Sony a7 III\",\"Personal vacation videos, Social media content\",Inspired,Vision,\"Learn production\",Because,\"Excellent - Regular exercise, no health concerns\",No health conditions affecting diving,\"Recreational Scuba diving, Freediving\",\"Advanced Open Water, Rescue Diver\",250+,15.01.2026,\"Tropical Reefs, Open water\",8,\"Social Media (Instagram, Facebook, etc.), Word of mouth\",,",
    ].join("\n");

    const result = parseAcademyImportCsv("internship", csv);

    expect(result.unknownHeaders).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      sourceRowNumber: 2,
      email: "max@example.com",
      submittedAt: "2026-01-21T21:03:43.000Z",
      answers: {
        first_name: "Max",
        last_name: "Schneider",
        accommodation_ties: "No, I haven't.",
        education_level: "Bachelor's degree",
        internship_hopes: "Learn production",
        candidacy_reason: "Because",
        languages: ["English", "German"],
        content_created: [
          "Personal vacation videos",
          "Social media content",
        ],
        referral_source: [
          "Social Media (Instagram, Facebook, etc.)",
          "Word of mouth",
        ],
      },
    });
    expect(result.rows[0]?.answers).not.toHaveProperty("azores_ties");
    expect(result.rows[0]?.answers).not.toHaveProperty("hoped_gains");
    expect(result.rows[0]?.answers).not.toHaveProperty("why_good_candidate");
  });

  it("surfaces unknown headers instead of silently dropping them", () => {
    const csv = [
      "Zeitstempel,First Name,Last Name,Email,Unexpected column",
      "21.01.2026 21:03:43,Max,Schneider,max@example.com,test",
    ].join("\n");

    const result = parseAcademyImportCsv("internship", csv);

    expect(result.unknownHeaders).toEqual(["unexpected column"]);
  });

  it("surfaces missing required headers", () => {
    const csv = [
      "Zeitstempel,First Name,Last Name,Email",
      "21.01.2026 21:03:43,Max,Schneider,max@example.com",
    ].join("\n");

    const result = parseAcademyImportCsv("internship", csv);

    expect(result.missingHeaders).toContain(
      "what do you hope to gain from this internship?",
    );
  });

  it("surfaces duplicate headers", () => {
    const csv = [
      "Zeitstempel,First Name,First Name,Last Name,Email",
      "21.01.2026 21:03:43,Max,Max,Schneider,max@example.com",
    ].join("\n");

    const result = parseAcademyImportCsv("internship", csv);

    expect(result.duplicateHeaders).toEqual(["first name"]);
  });
});
