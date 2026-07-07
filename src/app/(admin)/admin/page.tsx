// The AI Agent panel lives on this route (?tab=ai) and its server actions
// POST here. A global map-reduce answer can legitimately run for minutes
// (DeepSeek client timeout is 360s), so raise this segment's cap above the
// platform default — otherwise production kills long answers mid-run.
export const maxDuration = 420;

export default function AdminPage() {
  return null;
}
