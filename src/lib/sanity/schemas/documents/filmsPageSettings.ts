import { defineField, defineType } from "sanity";

export const filmsPageSettings = defineType({
  name: "filmsPageSettings",
  title: "Films Page Settings",
  type: "document",
  fields: [
    defineField({
      name: "showLatestRow",
      title: "Show Latest Row",
      type: "boolean",
      description: "Display the automatically sorted Latest row on the films page.",
      initialValue: true,
    }),
    defineField({
      name: "showAllVideosRow",
      title: "Show All Videos Row",
      type: "boolean",
      description:
        "Display the automatically sorted row containing every visible film.",
      initialValue: true,
    }),
    defineField({
      name: "heroEyebrow",
      title: "Hero Eyebrow",
      type: "string",
      description:
        'Small caption above the featured film\'s title (e.g. "Featured film"). Cleared = hidden.',
    }),
    defineField({
      name: "watchButtonLabel",
      title: "Watch Button Label",
      type: "string",
      description:
        'Label of the hero\'s play button. Defaults to "Watch film" if empty (the button itself always shows — it is the page\'s primary action).',
    }),
    defineField({
      name: "detailsButtonLabel",
      title: "Details Button Label",
      type: "string",
      description:
        'Label of the "More details" links in the hero and the playback modal. Defaults to "More details" if empty.',
    }),
    defineField({
      name: "catalogueHeading",
      title: "Catalogue Heading",
      type: "string",
      description:
        'Heading above the searchable catalogue (e.g. "All films"). Cleared = hidden.',
    }),
    defineField({
      name: "catalogueDescription",
      title: "Catalogue Description",
      type: "text",
      rows: 2,
      description: "Short blurb under the catalogue heading. Cleared = hidden.",
    }),
    defineField({
      name: "featuredRowTitle",
      title: "Featured Row Title",
      type: "string",
      description:
        "Title of the automatic row of featured films. Cleared = the row shows with no heading.",
    }),
    defineField({
      name: "latestRowTitle",
      title: "Latest Row Title",
      type: "string",
      description:
        'Title of the automatic Latest row. Cleared = the row shows with no heading (use "Show Latest Row" to hide the row itself).',
    }),
    defineField({
      name: "allFilmsRowTitle",
      title: "All Films Row Title",
      type: "string",
      description:
        'Title of the automatic row containing every film. Cleared = the row shows with no heading (use "Show All Videos Row" to hide the row itself).',
    }),
  ],
  preview: {
    prepare: () => ({ title: "Films Page Settings" }),
  },
});
