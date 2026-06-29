"use client";

import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { presentationTool } from "sanity/presentation";
import { schemaTypes } from "./src/lib/sanity/schemas";

export default defineConfig({
  name: "btm-hub",
  title: "Behind the Mask CMS",
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  basePath: "/studio",
  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title("Content")
          .items([
            // The three things admins manage day-to-day, up top.
            S.documentTypeListItem("film").title("Films"),
            S.documentTypeListItem("filmCollection").title("Collections"),
            S.documentTypeListItem("teamMember").title("Team"),
            S.documentTypeListItem("homepageVideo").title("Homepage videos"),
            S.divider(),
            // Less-frequent content, tucked below.
            S.documentTypeListItem("partner").title("Partners"),
            S.listItem()
              .title("Films Page Settings")
              .schemaType("filmsPageSettings")
              .child(
                S.document()
                  .title("Films Page Settings")
                  .schemaType("filmsPageSettings")
                  .documentId("filmsPageSettings"),
              ),
            // "program" is intentionally hidden from the desk — unused on the site.
          ]),
    }),
    presentationTool({
      previewUrl: {
        previewMode: {
          enable: "/api/draft-mode/enable",
        },
      },
    }),
  ],
  schema: {
    types: schemaTypes,
    templates: (templates) =>
      templates.filter((template) => template.schemaType !== "filmsPageSettings"),
  },
});
