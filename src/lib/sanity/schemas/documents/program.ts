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
      validation: (rule) => rule.required(),
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
