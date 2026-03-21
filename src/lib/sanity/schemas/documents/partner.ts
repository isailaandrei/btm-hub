import { defineType, defineField } from "sanity";

export const partner = defineType({
  name: "partner",
  title: "Partner",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Name",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "name", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "logo",
      title: "Logo",
      type: "image",
      fields: [
        {
          name: "alt",
          type: "string",
          title: "Alt Text",
          validation: (rule) => rule.required(),
        },
      ],
    }),
    defineField({
      name: "logoDark",
      title: "Logo (Dark Mode)",
      type: "image",
      description: "Optional logo variant for dark backgrounds",
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "portableText",
    }),
    defineField({
      name: "shortDescription",
      title: "Short Description",
      type: "text",
      rows: 2,
    }),
    defineField({
      name: "website",
      title: "Website",
      type: "url",
    }),
    defineField({
      name: "memberDiscount",
      title: "Member Discount",
      type: "string",
      description: "e.g. 15% off for BTM members",
    }),
    defineField({
      name: "tier",
      title: "Tier",
      type: "string",
      validation: (rule) => rule.required(),
      options: {
        list: [
          { title: "Platinum", value: "platinum" },
          { title: "Gold", value: "gold" },
          { title: "Silver", value: "silver" },
          { title: "Community", value: "community" },
        ],
      },
    }),
    defineField({
      name: "featured",
      title: "Featured",
      type: "boolean",
      initialValue: false,
      description: "Show on homepage partners section",
    }),
    defineField({
      name: "sortOrder",
      title: "Sort Order",
      type: "number",
      initialValue: 0,
    }),
  ],
  orderings: [
    {
      title: "Sort Order",
      name: "sortOrder",
      by: [{ field: "sortOrder", direction: "asc" }],
    },
  ],
  preview: {
    select: { title: "name", subtitle: "tier", media: "logo" },
  },
});
