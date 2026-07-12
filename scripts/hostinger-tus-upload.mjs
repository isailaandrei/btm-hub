#!/usr/bin/env node
//
// Upload ONE archive to a Hostinger website file host over the TUS resumable
// protocol. Called by scripts/hostinger-deploy.sh after it has fetched the
// one-time upload URL + auth keys from POST /files/upload-urls.
//
// ── Why this Node helper exists ──────────────────────────────────────────────
// The old one-shot multipart `POST .../nodejs/builds/from-archive` is dead:
// developers.hostinger.com is fronted by Cloudflare bot protection that 403s
// multipart POSTs (and, in fact, 403s ANY plain Node/Python fetch — even a
// GET — because it fingerprints the client; only curl-shaped requests pass).
// The supported path (what the official hostinger-api-mcp package's
// handleJavascriptApplicationDeploy does) is to upload the archive to the
// website's file host via TUS, then start a build from it. That file host
// (srv*-files.hstgr.io) is NOT Cloudflare-fronted, so plain `fetch` works here
// even though it is blocked on the API host — which is why the upload lives in
// Node while every developers.hostinger.com call stays in curl.
//
// Faithful replication of the MCP mechanics (src/core/runtime.js `uploadFile`):
//   file URL   = <upload-url>/<basename>?override=true
//   headers    = X-Auth: <auth_key>, X-Auth-Rest: <rest_auth_key>
//   1. create  POST  with Upload-Length + Upload-Offset:0, empty body  → 201
//   2. data    PATCH application/offset+octet-stream, 10 MiB chunks,
//              Tus-Resumable:1.0.0, Upload-Offset:<offset>             → 204
// (The MCP passes filename via TUS metadata, but because it resumes an existing
// uploadUrl the metadata is never actually sent — the name lives only in the
// URL path, so we don't send Upload-Metadata either.)
//
// Usage:  node hostinger-tus-upload.mjs <upload-url> <archive-path>
// Env:    HOSTINGER_UPLOAD_AUTH       X-Auth       (= upload-urls auth_key)
//         HOSTINGER_UPLOAD_AUTH_REST  X-Auth-Rest  (= upload-urls rest_auth_key)
// Fails loud: any non-2xx prints the server status + body and exits non-zero.

import { statSync, readFileSync } from "node:fs";
import { basename } from "node:path";

const [uploadUrl, archivePath] = process.argv.slice(2);
const auth = process.env.HOSTINGER_UPLOAD_AUTH;
const authRest = process.env.HOSTINGER_UPLOAD_AUTH_REST;

if (!uploadUrl || !archivePath) {
  console.error("usage: hostinger-tus-upload.mjs <upload-url> <archive-path>");
  process.exit(2);
}
if (!auth || !authRest) {
  console.error("!! missing HOSTINGER_UPLOAD_AUTH / HOSTINGER_UPLOAD_AUTH_REST env");
  process.exit(2);
}

const CHUNK = 10 * 1024 * 1024; // 10 MiB — matches hostinger-api-mcp's tus chunkSize
const name = basename(archivePath);
const size = statSync(archivePath).size;
const fileUrl = `${uploadUrl.replace(/\/+$/, "")}/${name}?override=true`;
const authHeaders = { "X-Auth": auth, "X-Auth-Rest": authRest };

async function bodyText(res) {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "<no body>";
  }
}

async function main() {
  // 1. Create the upload resource (mirrors the MCP's manual pre-upload POST).
  const created = await fetch(fileUrl, {
    method: "POST",
    headers: { ...authHeaders, "Upload-Length": String(size), "Upload-Offset": "0" },
  });
  if (created.status !== 201 && created.status !== 200) {
    throw new Error(`create failed: HTTP ${created.status} — ${await bodyText(created)}`);
  }

  // 2. PATCH the bytes in 10 MiB chunks from the current offset.
  const buf = readFileSync(archivePath); // archive is source-only, < 50 MB
  let offset = 0;
  while (offset < size) {
    const end = Math.min(offset + CHUNK, size);
    const res = await fetch(fileUrl, {
      method: "PATCH",
      headers: {
        ...authHeaders,
        "Content-Type": "application/offset+octet-stream",
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": String(offset),
      },
      body: buf.subarray(offset, end),
    });
    if (res.status !== 204 && res.status !== 200) {
      throw new Error(`patch @${offset} failed: HTTP ${res.status} — ${await bodyText(res)}`);
    }
    const serverOffset = Number(res.headers.get("upload-offset"));
    offset = Number.isFinite(serverOffset) && serverOffset > offset ? serverOffset : end;
  }

  if (offset !== size) {
    throw new Error(`upload incomplete: server accepted ${offset}/${size} bytes`);
  }
  console.error(`==> TUS upload OK: ${name} (${size} bytes)`);
}

main().catch((err) => {
  console.error(`!! TUS upload failed: ${err.message}`);
  process.exit(1);
});
