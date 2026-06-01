import "server-only";

import { StreamChat } from "stream-chat";
import { getStreamChatConfig } from "./env";

export function createStreamServerClient() {
  const { apiKey, apiSecret } = getStreamChatConfig();
  return StreamChat.getInstance(apiKey, apiSecret);
}
