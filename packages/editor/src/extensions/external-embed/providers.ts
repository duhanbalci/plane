/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TExternalEmbedProvider = {
  key: string;
  label: string;
  /** hosts the provider is served from, matched on the host and its subdomains */
  hosts: string[];
  /** returns the iframe url, or undefined when this particular link cannot be framed */
  toEmbedUrl: (url: URL) => string | undefined;
};

const matchesHost = (host: string, allowed: string): boolean => host === allowed || host.endsWith(`.${allowed}`);

const getPathSegments = (url: URL): string[] => url.pathname.split("/").filter(Boolean);

const youtube: TExternalEmbedProvider = {
  key: "youtube",
  label: "YouTube",
  hosts: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
  toEmbedUrl: (url) => {
    let videoId: string | undefined;
    if (matchesHost(url.hostname, "youtu.be")) {
      videoId = getPathSegments(url)[0];
    } else if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v") ?? undefined;
    } else if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
      videoId = getPathSegments(url)[1];
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : undefined;
  },
};

const figma: TExternalEmbedProvider = {
  key: "figma",
  label: "Figma",
  hosts: ["figma.com"],
  toEmbedUrl: (url) => {
    const kind = getPathSegments(url)[0];
    if (!kind || !["file", "design", "proto", "board", "slides"].includes(kind)) return undefined;
    return `https://www.figma.com/embed?embed_host=plane&url=${encodeURIComponent(url.toString())}`;
  },
};

const googleDocs: TExternalEmbedProvider = {
  key: "google-docs",
  label: "Google Docs",
  hosts: ["docs.google.com"],
  toEmbedUrl: (url) => {
    const segments = getPathSegments(url);
    const [kind, dSegment, documentId] = segments;
    if (!documentId || dSegment !== "d") return undefined;
    if (kind === "presentation") return `https://docs.google.com/presentation/d/${documentId}/embed`;
    if (kind === "document" || kind === "spreadsheets" || kind === "forms") {
      return `https://docs.google.com/${kind}/d/${documentId}/preview`;
    }
    return undefined;
  },
};

const loom: TExternalEmbedProvider = {
  key: "loom",
  label: "Loom",
  hosts: ["loom.com"],
  toEmbedUrl: (url) => {
    const segments = getPathSegments(url);
    if (segments[0] !== "share" && segments[0] !== "embed") return undefined;
    const videoId = segments[1];
    return videoId ? `https://www.loom.com/embed/${videoId}` : undefined;
  },
};

const vimeo: TExternalEmbedProvider = {
  key: "vimeo",
  label: "Vimeo",
  hosts: ["vimeo.com"],
  toEmbedUrl: (url) => {
    if (matchesHost(url.hostname, "player.vimeo.com")) return url.toString();
    const videoId = getPathSegments(url)[0];
    return videoId && /^\d+$/.test(videoId) ? `https://player.vimeo.com/video/${videoId}` : undefined;
  },
};

const codesandbox: TExternalEmbedProvider = {
  key: "codesandbox",
  label: "CodeSandbox",
  hosts: ["codesandbox.io"],
  toEmbedUrl: (url) => {
    const segments = getPathSegments(url);
    if (segments[0] === "embed") return url.toString();
    if (segments[0] === "s" && segments[1]) return `https://codesandbox.io/embed/${segments[1]}`;
    if (segments[0] === "p" && segments[1] === "sandbox" && segments[2]) {
      return `https://codesandbox.io/embed/${segments[2]}`;
    }
    return undefined;
  },
};

export const EXTERNAL_EMBED_PROVIDERS: TExternalEmbedProvider[] = [
  youtube,
  figma,
  googleDocs,
  loom,
  vimeo,
  codesandbox,
];

export const parseExternalEmbedUrl = (src: string | null | undefined): URL | undefined => {
  if (!src) return undefined;
  try {
    const url = new URL(src.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url;
  } catch {
    return undefined;
  }
};

/** the provider that can frame this link, if any */
export const getExternalEmbedProvider = (src: string | null | undefined): TExternalEmbedProvider | undefined => {
  const url = parseExternalEmbedUrl(src);
  if (!url) return undefined;
  return EXTERNAL_EMBED_PROVIDERS.find((provider) => provider.hosts.some((host) => matchesHost(url.hostname, host)));
};

/** the iframe url for an allowlisted link, undefined for everything else */
export const getExternalEmbedIframeUrl = (src: string | null | undefined): string | undefined => {
  const url = parseExternalEmbedUrl(src);
  if (!url) return undefined;
  const provider = getExternalEmbedProvider(src);
  return provider?.toEmbedUrl(url);
};

/** a readable title guessed from the url path, no network call */
export const getExternalEmbedTitle = (src: string | null | undefined): string => {
  const url = parseExternalEmbedUrl(src);
  if (!url) return src ?? "";
  const segments = getPathSegments(url);
  const lastSegment = segments[segments.length - 1];
  if (!lastSegment) return url.hostname;
  const decoded = decodeURIComponent(lastSegment).replace(/\.[a-z0-9]{1,5}$/i, "");
  const readable = decoded.replaceAll("-", " ").replaceAll("_", " ").trim();
  return readable.length > 0 ? readable : url.hostname;
};
