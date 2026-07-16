import { defineType, defineField } from "sanity";

// Slug values must match ProgramSlug in src/types/database.ts:
// "photography" | "filmmaking" | "freediving" | "internship"
export const program = defineType({
  name: "program",
  title: "Program",
  type: "document",
  fields: [
    defineField({
      name: "slug",
      title: "Program Slug",
      type: "string",
      options: {
        list: [
          { title: "Underwater Photography", value: "photography" },
          { title: "Underwater Filmmaking", value: "filmmaking" },
          { title: "Freediving & Modelling", value: "freediving" },
          { title: "BTM Internship", value: "internship" },
        ],
      },
      validation: (rule) =>
        rule.required().custom(async (value, context) => {
          if (!value) return true;
          const client = context.getClient({ apiVersion: "2025-03-20" });
          const count = await client.fetch(
            `count(*[_type == "program" && slug == $slug && _id != $id])`,
            { slug: value, id: context.document?._id?.replace("drafts.", "") },
          );
          return count > 0 ? "A program with this slug already exists" : true;
        }),
    }),
    defineField({
      name: "name",
      title: "Name (display)",
      type: "string",
      description: "Programme name shown on the Academy page. Clear to hide.",
    }),
    defineField({
      name: "tag",
      title: "Tag (hero hook)",
      type: "string",
      description: "Short hook under the name on the hero panel.",
    }),
    defineField({
      name: "overline",
      title: "Overline",
      type: "string",
      description: "Small kicker above the name in the deep-dive section.",
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 4,
      description: "Lead paragraph in the deep-dive section.",
    }),
    defineField({
      name: "shortDescription",
      title: "Short Description (hero lead)",
      type: "text",
      rows: 2,
      description:
        "Lead paragraph under the name in the detail-page hero. Clear to hide.",
    }),
    defineField({
      name: "heroImage",
      title: "Hero Image",
      type: "image",
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
      name: "panelImage",
      title: "Panel Image",
      type: "image",
      description:
        "Portrait photo (roughly 4:5) shown as this programme's tile on the Academy grid. Leave empty to use the shipped default.",
      options: { hotspot: true },
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
      name: "overviewImage",
      title: "Overview Image",
      type: "image",
      description:
        "Photo used in the deep-dive / overview blocks (displayed cropped to portrait). Leave empty to use the shipped default.",
      options: { hotspot: true },
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
      name: "heroVideo",
      title: "Hero Video URL",
      type: "url",
      description: "YouTube or Vimeo embed URL for hero section",
    }),
    defineField({
      name: "fullDescription",
      title: "Full Description",
      type: "portableText",
    }),
    defineField({
      name: "highlights",
      title: "Highlights",
      type: "array",
      of: [{ type: "string" }],
      description: "Key bullet-point features of this program",
    }),
    defineField({
      name: "curriculum",
      title: "Curriculum",
      type: "portableText",
    }),
    defineField({
      name: "instructor",
      title: "Lead Instructor",
      type: "reference",
      to: [{ type: "teamMember" }],
    }),
    defineField({
      name: "gallery",
      title: "Gallery",
      type: "gallery",
    }),
    defineField({
      name: "faqs",
      title: "FAQs",
      type: "array",
      of: [{ type: "faq" }],
    }),
    defineField({
      name: "testimonials",
      title: "Testimonials",
      type: "array",
      of: [{ type: "testimonial" }],
    }),
    defineField({
      name: "pricing",
      title: "Pricing Info",
      type: "portableText",
    }),
    defineField({
      name: "applicationOpen",
      title: "Applications Open",
      type: "boolean",
      description:
        "Override the code-level default. When set, this takes priority over the static config.",
    }),
    defineField({
      name: "seoDescription",
      title: "SEO Description",
      type: "text",
      rows: 3,
      description: "Used for meta description. Falls back to program short description.",
    }),
  ],
  preview: {
    select: { title: "slug" },
    prepare({ title }) {
      const names: Record<string, string> = {
        photography: "Underwater Photography",
        filmmaking: "Underwater Filmmaking",
        freediving: "Freediving & Modelling",
        internship: "BTM Internship",
      };
      return { title: names[title] ?? title };
    },
  },
});
