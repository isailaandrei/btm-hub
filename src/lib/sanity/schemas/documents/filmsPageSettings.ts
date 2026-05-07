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
  ],
  preview: {
    prepare: () => ({ title: "Films Page Settings" }),
  },
});
