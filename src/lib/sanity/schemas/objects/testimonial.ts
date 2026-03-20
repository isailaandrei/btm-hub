import { defineType, defineField } from "sanity";

export const testimonial = defineType({
  name: "testimonial",
  title: "Testimonial",
  type: "object",
  fields: [
    defineField({
      name: "quote",
      title: "Quote",
      type: "text",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "authorName",
      title: "Author Name",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "authorDetail",
      title: "Author Detail",
      type: "string",
      description: "e.g. role, location, or program attended",
    }),
    defineField({
      name: "authorImage",
      title: "Author Image",
      type: "image",
      options: { hotspot: true },
    }),
  ],
  preview: {
    select: { title: "authorName", subtitle: "quote" },
  },
});
