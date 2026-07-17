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
            // Everything films-related in one place.
            S.listItem()
              .title("Films")
              .child(
                S.list()
                  .title("Films")
                  .items([
                    S.documentTypeListItem("film").title("All films"),
                    S.documentTypeListItem("filmCollection").title(
                      "Collections",
                    ),
                    S.listItem()
                      .title("Page settings")
                      .schemaType("filmsPageSettings")
                      .child(
                        S.document()
                          .title("Films Page Settings")
                          .schemaType("filmsPageSettings")
                          .documentId("filmsPageSettings"),
                      ),
                  ]),
              ),
            // Everything academy-related in one place.
            S.listItem()
              .title("Academy")
              .child(
                S.list()
                  .title("Academy")
                  .items([
                    S.documentTypeListItem("program").title("Programmes"),
                    S.listItem()
                      .title("Page settings")
                      .schemaType("academyPageSettings")
                      .child(
                        S.document()
                          .title("Academy Page Settings")
                          .schemaType("academyPageSettings")
                          .documentId("academyPageSettings"),
                      ),
                  ]),
              ),
            S.documentTypeListItem("teamMember").title("Team"),
            S.documentTypeListItem("homepageVideo").title("Homepage videos"),
            S.divider(),
            // Less-frequent content, tucked below.
            S.documentTypeListItem("partner").title("Partners"),
          ]),
    }),
    presentationTool({
      previewUrl: {
        // Default the preview to a page that has the visual-editing bridge.
        // The homepage (/) is in the (home) route group without the bridge, so
        // it can't connect ("Unable to connect to visual editing"); landing on
        // /academy avoids that. (Wiring the homepage itself was tried via a
        // (home)/layout.tsx and broke route resolution — see the memory note.)
        preview: "/academy",
        previewMode: {
          enable: "/api/draft-mode/enable",
        },
      },
    }),
  ],
  schema: {
    types: schemaTypes,
    templates: (templates) =>
      templates.filter(
        (template) =>
          template.schemaType !== "filmsPageSettings" &&
          template.schemaType !== "academyPageSettings",
      ),
  },
});
