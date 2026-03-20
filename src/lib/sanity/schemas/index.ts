import type { SchemaTypeDefinition } from "sanity";

// Objects
import { portableText } from "./objects/portableText";
import { gallery } from "./objects/gallery";
import { socialLink } from "./objects/socialLink";
import { faq } from "./objects/faq";
import { testimonial } from "./objects/testimonial";

// Documents
import { film } from "./documents/film";
import { program } from "./documents/program";
import { teamMember } from "./documents/teamMember";
import { partner } from "./documents/partner";

export const schemaTypes: SchemaTypeDefinition[] = [
  // Objects
  portableText,
  gallery,
  socialLink,
  faq,
  testimonial,
  // Documents
  film,
  program,
  teamMember,
  partner,
];
