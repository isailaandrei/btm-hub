export function prependTemplateOnce<T extends { id: string }>(
  templates: T[],
  template: T,
): T[] {
  const existingIndex = templates.findIndex((item) => item.id === template.id);
  if (existingIndex === -1) return [template, ...templates];

  return templates.map((item) => (item.id === template.id ? template : item));
}
