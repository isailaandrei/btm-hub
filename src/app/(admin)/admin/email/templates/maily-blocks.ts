import {
  blockquote,
  bulletList,
  button,
  columns,
  divider,
  footer,
  heading1,
  heading2,
  image,
  logo,
  section,
  spacer,
  text,
  type BlockGroupItem,
} from "@maily-to/core/blocks";

export const mailyBlockGroups = [
  {
    title: "Content",
    commands: [text, heading1, heading2, bulletList, blockquote],
  },
  {
    title: "Visual",
    commands: [image, logo, button, divider, spacer],
  },
  {
    title: "Layout",
    commands: [section, columns, footer],
  },
] satisfies BlockGroupItem[];
