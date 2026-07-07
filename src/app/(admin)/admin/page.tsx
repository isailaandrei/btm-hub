// The AI Agent panel lives on this route (?tab=ai) and its server actions
// POST here. A global map-reduce answer can legitimately run for minutes
// (observed 15-110s; DeepSeek client timeout is 360s), so raise this
// segment's cap above the platform default. 300 is the Vercel HOBBY plan
// ceiling — a worst-case answer that outlives it dies at 300s; raise this
// toward 360+ if the project moves to a plan/host without that cap.
export const maxDuration = 300;

export default function AdminPage() {
  return null;
}
