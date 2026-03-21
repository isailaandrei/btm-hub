import { defineLive } from "next-sanity/live";
import { client } from "./client";

const token = process.env.SANITY_API_READ_TOKEN;

if (!token) {
  console.warn(
    "[sanity] SANITY_API_READ_TOKEN is not set. Draft mode and unpublished content will not be available.",
  );
}

export const { sanityFetch, SanityLive } = defineLive({
  client: client.withConfig({
    stega: { studioUrl: "/studio" },
  }),
  serverToken: token || false,
  browserToken: false,
});
