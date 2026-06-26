import { defineType, defineField } from "sanity";
import { getFilmVideoInfo } from "../../../films/embed";

type FilmCreditValidationValue = {
  teamMember?: { _ref?: string };
  name?: string;
};

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
      name: "poster",
      title: "Poster image",
      type: "image",
      group: "content",
      description:
        "Optional high-quality still for the films hero banner and cards. Falls back to the video's thumbnail when empty. Use a wide 16:9 image; the focal point (hotspot) is preserved when cropped.",
      options: { hotspot: true },
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "portableText",
      group: "content",
    }),
    defineField({
      name: "videoEmbed",
      title: "Video Embed URL",
      type: "url",
      group: "playback",
      description: "YouTube or Vimeo URL",
      validation: (rule) =>
        rule
          .required()
          .uri({ scheme: ["https"] })
          .custom((value) => {
            if (typeof value !== "string" || value.trim().length === 0) {
              return true;
            }

            return getFilmVideoInfo(value)
              ? true
              : "Enter a supported YouTube or Vimeo URL.";
          }),
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
            defineField({
              name: "role",
              type: "string",
              title: "Role",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "teamMember",
              title: "Team Member",
              type: "reference",
              to: [{ type: "teamMember" }],
              description:
                "Select a Behind The Mask team member to link this credit to their profile.",
            }),
            defineField({
              name: "name",
              type: "string",
              title: "External Name",
              description:
                "Required when this credit is not linked to a team member.",
            }),
            defineField({
              name: "externalLinks",
              title: "External Links / Contacts",
              type: "array",
              description:
                "Optional website, email, phone, or profile links for non-team credits.",
              of: [
                {
                  type: "object",
                  fields: [
                    defineField({
                      name: "label",
                      title: "Label",
                      type: "string",
                      validation: (rule) => rule.required(),
                    }),
                    defineField({
                      name: "url",
                      title: "URL",
                      type: "url",
                      validation: (rule) =>
                        rule.required().uri({
                          scheme: ["http", "https", "mailto", "tel"],
                        }),
                    }),
                  ],
                  preview: {
                    select: { title: "label", subtitle: "url" },
                  },
                },
              ],
            }),
          ],
          validation: (rule) =>
            rule.custom((value: FilmCreditValidationValue | undefined) => {
              if (!value) return true;
              const hasTeamMember = Boolean(value.teamMember?._ref);
              const hasExternalName =
                typeof value.name === "string" && value.name.trim().length > 0;
              return hasTeamMember || hasExternalName
                ? true
                : "Select a team member or enter an external name.";
            }),
          preview: {
            select: {
              externalName: "name",
              memberName: "teamMember.name",
              role: "role",
            },
            prepare({ externalName, memberName, role }) {
              return {
                title: memberName || externalName || "Unnamed credit",
                subtitle: role,
              };
            },
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
    select: { title: "title", subtitle: "tagline" },
  },
});
