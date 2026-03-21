import { defineType, defineField } from "sanity";

export const film = defineType({
  name: "film",
  title: "Film",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "tagline",
      title: "Tagline",
      type: "string",
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "portableText",
    }),
    defineField({
      name: "heroImage",
      title: "Hero Image",
      type: "image",
      options: { hotspot: true },
      validation: (rule) => rule.required(),
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
      name: "videoEmbed",
      title: "Video Embed URL",
      type: "url",
      description: "YouTube or Vimeo URL",
    }),
    defineField({
      name: "gallery",
      title: "Gallery",
      type: "gallery",
    }),
    defineField({
      name: "credits",
      title: "Credits",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "role", type: "string", title: "Role", validation: (rule) => rule.required() }),
            defineField({ name: "name", type: "string", title: "Name", validation: (rule) => rule.required() }),
          ],
          preview: {
            select: { title: "name", subtitle: "role" },
          },
        },
      ],
    }),
    defineField({
      name: "releaseYear",
      title: "Release Year",
      type: "number",
    }),
    defineField({
      name: "duration",
      title: "Duration",
      type: "string",
      description: "e.g. 12:34",
    }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      options: {
        list: [
          { title: "Published", value: "published" },
          { title: "In Production", value: "in-production" },
          { title: "Coming Soon", value: "coming-soon" },
        ],
      },
      initialValue: "published",
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
    select: { title: "title", subtitle: "tagline", media: "heroImage" },
  },
});
