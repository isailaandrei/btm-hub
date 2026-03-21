import { defineType, defineField } from "sanity";

export const teamMember = defineType({
  name: "teamMember",
  title: "Team Member",
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
      name: "photo",
      title: "Photo",
      type: "image",
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
      name: "role",
      title: "Role",
      type: "string",
      options: {
        list: [
          { title: "Founder", value: "founder" },
          { title: "Instructor", value: "instructor" },
          { title: "Guide", value: "guide" },
        ],
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "title",
      title: "Job Title",
      type: "string",
      description: "e.g. Lead Underwater Photography Instructor",
    }),
    defineField({
      name: "shortBio",
      title: "Short Bio",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "fullBio",
      title: "Full Bio",
      type: "portableText",
    }),
    defineField({
      name: "specialties",
      title: "Specialties",
      type: "array",
      of: [{ type: "string" }],
    }),
    defineField({
      name: "socialLinks",
      title: "Social Links",
      type: "array",
      of: [{ type: "socialLink" }],
    }),
    defineField({
      name: "featured",
      title: "Featured",
      type: "boolean",
      initialValue: false,
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
    select: { title: "name", subtitle: "role", media: "photo" },
  },
});
