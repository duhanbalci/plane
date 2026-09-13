/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

type TMermaidApi = typeof import("mermaid").default;

let mermaidPromise: Promise<TMermaidApi> | undefined;

/**
 * mermaid ~1 MB, bundle'ı şişirmesin diye ilk önizlemede lazy yüklenir.
 * `startOnLoad: false` ile kütüphane DOM'u kendiliğinden taramaz.
 */
const loadMermaid = async (): Promise<TMermaidApi> => {
  mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => {
    // uygulama temasi html[data-theme] ile geliyor; gercek Plane'de diyagram koyu temada koyu
    const isDark = /dark/.test(document.documentElement.getAttribute("data-theme") ?? "");
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? "dark" : "default",
      securityLevel: "strict",
      fontFamily: "inherit",
    });
    return mermaid;
  });
  return mermaidPromise;
};

export type TMermaidRenderResult = { svg: string; error?: undefined } | { svg?: undefined; error: string };

/** grafiği SVG'ye çevirir; boş/hatalı kodda mesaj döner */
export const renderMermaidDiagram = async (id: string, code: string): Promise<TMermaidRenderResult> => {
  const source = code.trim();
  if (!source) return { error: "Nothing to preview yet. Write some Mermaid code first." };

  try {
    const mermaid = await loadMermaid();
    await mermaid.parse(source);
    const { svg } = await mermaid.render(id, source);
    return { svg };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to render this Mermaid diagram.";
    return { error: message };
  }
};
