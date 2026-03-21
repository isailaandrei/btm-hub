import { defineEnableDraftMode } from "next-sanity/draft-mode";
import { client } from "@/lib/sanity/client";

const token = process.env.SANITY_API_READ_TOKEN;

export const { GET } = token
  ? defineEnableDraftMode({ client: client.withConfig({ token }) })
  : {
      GET: () =>
        new Response(
          "Draft mode unavailable: missing SANITY_API_READ_TOKEN",
          { status: 503 },
        ),
    };
