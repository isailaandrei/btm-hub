import type { FormDefinition } from "./types";

const formRegistry: Record<string, FormDefinition> = {};

export function registerForm(def: FormDefinition) {
  formRegistry[def.programSlug] = def;
}

export function getFormDefinition(slug: string): FormDefinition | undefined {
  return formRegistry[slug];
}
