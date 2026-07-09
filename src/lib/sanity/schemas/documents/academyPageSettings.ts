import { defineField, defineType } from "sanity";

export const academyPageSettings = defineType({
  name: "academyPageSettings",
  title: "Academy Page Settings",
  type: "document",
  fields: [
    defineField({
      name: "ctaImage",
      title: "CTA Background Image",
      type: "image",
      description:
        "Wide background photo behind the closing call-to-action band on the Academy page. Leave empty to use the shipped default.",
      options: { hotspot: true },
      fields: [
        {
          name: "alt",
          type: "string",
          title: "Alt Text",
        },
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: "Academy Page Settings" }),
  },
});
