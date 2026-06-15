export const TAG_COLOR_CLASSES: Record<string, string> = {
  red: "border-red-500/40 bg-red-500/10 text-red-400",
  orange: "border-orange-500/40 bg-orange-500/10 text-orange-400",
  yellow: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
  green: "border-green-500/40 bg-green-500/10 text-green-400",
  blue: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  purple: "border-purple-500/40 bg-purple-500/10 text-purple-400",
  pink: "border-pink-500/40 bg-pink-500/10 text-pink-400",
};

export const TAG_COLOR_VALUES = Object.freeze(
  Object.keys(TAG_COLOR_CLASSES),
) as readonly string[];

export const TAG_COLOR_PRESETS = [
  { label: "Red", value: "red" },
  { label: "Orange", value: "orange" },
  { label: "Yellow", value: "yellow" },
  { label: "Green", value: "green" },
  { label: "Blue", value: "blue" },
  { label: "Purple", value: "purple" },
  { label: "Pink", value: "pink" },
] as const;

export const PROGRAM_BADGE_CLASS: Record<string, string> = {
  filmmaking: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  photography: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  freediving: "border-teal-500/40 bg-teal-500/10 text-teal-400",
  internship: "border-purple-500/40 bg-purple-500/10 text-purple-400",
};
