import { defineField, defineType } from "sanity";

export const academyPageSettings = defineType({
  name: "academyPageSettings",
  title: "Academy Page Settings",
  type: "document",
  fields: [
    defineField({
      name: "heroEyebrow",
      title: "Hero Eyebrow",
      type: "string",
    }),
    defineField({
      name: "heroHeading",
      title: "Hero Heading",
      type: "string",
    }),
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
    defineField({
      name: "ctaHeading",
      title: "CTA Heading",
      type: "string",
    }),
    defineField({
      name: "ctaBody",
      title: "CTA Body",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "ctaButtonLabel",
      title: "CTA Button Label",
      type: "string",
    }),
  ],
  preview: {
    prepare: () => ({ title: "Academy Page Settings" }),
  },
});
