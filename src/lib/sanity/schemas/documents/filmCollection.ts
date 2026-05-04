import { defineType, defineField } from "sanity";

export const filmCollection = defineType({
  name: "filmCollection",
  title: "Film Collection",
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
      name: "description",
      title: "Description",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "films",
      title: "Films",
      type: "array",
      of: [{ type: "reference", to: [{ type: "film" }] }],
      validation: (rule) =>
        rule
          .required()
          .min(1)
          .unique()
          .custom((films) => {
            if (!Array.isArray(films)) return true;
            const refs = films
              .map((film) =>
                typeof film === "object" && film !== null && "_ref" in film
                  ? String(film._ref)
                  : "",
              )
              .filter(Boolean);
            return new Set(refs).size === refs.length
              ? true
              : "A film can only appear once in a collection.";
          }),
    }),
    defineField({
      name: "sortOrder",
      title: "Sort Order",
      type: "number",
      initialValue: 0,
    }),
    defineField({
      name: "enabled",
      title: "Enabled",
      type: "boolean",
      initialValue: true,
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
    select: { title: "title", subtitle: "description" },
  },
});
