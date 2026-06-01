import type { UserResponse } from "stream-chat";

type StreamProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export function toStreamUser(profile: StreamProfile): UserResponse {
  const name = profile.display_name?.trim() || "Community Member";

  return {
    id: profile.id,
    name,
    ...(profile.avatar_url ? { image: profile.avatar_url } : {}),
  };
}
