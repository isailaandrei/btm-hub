import { defineField, defineType } from "sanity";

export const homepageVideo = defineType({
  name: "homepageVideo",
  title: "Homepage Video",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "youtubeId",
      title: "YouTube video ID",
      type: "string",
      description:
        'The id after "watch?v=" in a YouTube link — e.g. for youtube.com/watch?v=8v-kApucQSk the id is 8v-kApucQSk.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "sortOrder",
      title: "Sort order",
      type: "number",
      description: "Lower numbers appear first in the homepage carousel.",
      initialValue: 0,
    }),
  ],
  orderings: [
    {
      title: "Sort order",
      name: "sortOrderAsc",
      by: [{ field: "sortOrder", direction: "asc" }],
    },
  ],
  preview: {
    select: { title: "title", subtitle: "youtubeId" },
  },
});
