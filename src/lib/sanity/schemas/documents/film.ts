import { defineType, defineField } from "sanity";

const metadataField = (name: string, title: string, description: string) =>
  defineField({
    name,
    title,
    type: "array",
    group: "metadata",
    description,
    of: [{ type: "string" }],
    options: { layout: "tags" },
    validation: (rule) =>
      rule.unique().custom((values) => {
        if (!Array.isArray(values)) return true;
        const normalized = values.map((value) =>
          String(value).trim().toLowerCase(),
        );
        return new Set(normalized).size === normalized.length
          ? true
          : "Values must be unique after trimming and case normalization.";
      }),
  });

export const film = defineType({
  name: "film",
  title: "Film",
  type: "document",
  groups: [
    { name: "content", title: "Content", default: true },
    { name: "media", title: "Media" },
    { name: "playback", title: "Playback" },
    { name: "metadata", title: "Metadata" },
  ],
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      group: "content",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      group: "content",
      options: { source: "title", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "tagline",
      title: "Tagline",
      type: "string",
      group: "content",
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "portableText",
      group: "content",
    }),
    defineField({
      name: "heroImage",
      title: "Hero Image",
      type: "image",
      group: "media",
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
      name: "thumbnailImage",
      title: "Card Thumbnail",
      type: "image",
      group: "media",
      description: "Optional 16:9 poster for film cards. Falls back to Hero Image.",
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
      name: "videoEmbed",
      title: "Video Embed URL",
      type: "url",
      group: "playback",
      description: "YouTube or Vimeo URL",
    }),
    defineField({
      name: "gallery",
      title: "Gallery",
      type: "gallery",
      group: "media",
    }),
    defineField({
      name: "credits",
      title: "Credits",
      type: "array",
      group: "content",
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
      group: "metadata",
    }),
    defineField({
      name: "duration",
      title: "Duration",
      type: "string",
      group: "metadata",
      description: "e.g. 12:34",
    }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      group: "metadata",
      options: {
        list: [
          { title: "Published", value: "published" },
          { title: "In Production", value: "in-production" },
          { title: "Coming Soon", value: "coming-soon" },
        ],
      },
      initialValue: "published",
    }),
    metadataField("locations", "Locations", "Places featured in the film."),
    metadataField(
      "subjects",
      "Subjects",
      "People, species, themes, or story subjects.",
    ),
    metadataField(
      "formats",
      "Formats",
      "Editorial format such as documentary, tutorial, short film, or behind the scenes.",
    ),
    metadataField(
      "skills",
      "Skills",
      "Production or underwater skills shown in the film.",
    ),
    defineField({
      name: "displayTags",
      title: "Display Tags",
      type: "array",
      group: "metadata",
      description: "Short editorial chips shown on cards and in the player modal.",
      of: [
        {
          type: "string",
          validation: (rule) => rule.max(32),
        },
      ],
      options: { layout: "tags" },
      validation: (rule) =>
        rule
          .max(6)
          .unique()
          .custom((values) => {
            if (!Array.isArray(values)) return true;
            const normalized = values.map((value) =>
              String(value).trim().toLowerCase(),
            );
            return new Set(normalized).size === normalized.length
              ? true
              : "Display tags must be unique after trimming and case normalization.";
          }),
    }),
    defineField({
      name: "featured",
      title: "Featured",
      type: "boolean",
      group: "metadata",
      initialValue: false,
    }),
    defineField({
      name: "sortOrder",
      title: "Sort Order",
      type: "number",
      group: "metadata",
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
