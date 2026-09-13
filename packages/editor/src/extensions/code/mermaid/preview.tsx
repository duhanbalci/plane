/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AddOutline, MinusOutline } from "@makeplane/propel/icons";
import { useEffect, useId, useState } from "react";
// plane utils
import { cn } from "@plane/utils";
// local imports
import { MERMAID_ZOOM_DEFAULT, MERMAID_ZOOM_MAX, MERMAID_ZOOM_MIN, MERMAID_ZOOM_STEP } from "./constants";
import { renderMermaidDiagram } from "./render";

type Props = {
  code: string;
};

export function MermaidPreview({ code }: Props) {
  // states
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(MERMAID_ZOOM_DEFAULT);
  // mermaid render'ı benzersiz bir DOM id ister
  const renderId = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const result = await renderMermaidDiagram(renderId, code);
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
        setSvg(null);
      } else {
        setError(null);
        setSvg(result.svg ?? null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [code, renderId]);

  if (error) {
    return (
      <div className="my-2 rounded-lg border border-danger-strong bg-danger-subtle px-[22px] py-6 text-13 text-danger-primary">
        <p className="font-medium">Mermaid diagram could not be rendered.</p>
        <p className="mt-1 text-11 whitespace-pre-wrap opacity-80">{error}</p>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-[10px] bg-layer-1 pt-12">
      <div className="horizontal-scrollbar scrollbar-sm overflow-auto px-[22px]">
        <div
          className="mx-auto w-fit origin-top transition-transform duration-150"
          style={{ transform: `scale(${zoom / 100})` }}
          // mermaid securityLevel: "strict" ile sanitize edilmiş SVG
          dangerouslySetInnerHTML={{ __html: svg ?? "" }}
        />
      </div>
      <div className="mt-4 flex items-center justify-center gap-2 border-t border-subtle py-2 text-11 text-tertiary">
        <button
          type="button"
          aria-label="Zoom out"
          className={cn("rounded p-1 transition-colors hover:bg-layer-1-hover hover:text-primary", {
            "cursor-not-allowed opacity-50": zoom <= MERMAID_ZOOM_MIN,
          })}
          disabled={zoom <= MERMAID_ZOOM_MIN}
          onClick={() => setZoom((z) => Math.max(MERMAID_ZOOM_MIN, z - MERMAID_ZOOM_STEP))}
        >
          <MinusOutline className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Reset zoom"
          className="w-12 rounded py-1 tabular-nums transition-colors hover:bg-layer-1-hover hover:text-primary"
          onClick={() => setZoom(MERMAID_ZOOM_DEFAULT)}
        >
          {zoom}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          className={cn("rounded p-1 transition-colors hover:bg-layer-1-hover hover:text-primary", {
            "cursor-not-allowed opacity-50": zoom >= MERMAID_ZOOM_MAX,
          })}
          disabled={zoom >= MERMAID_ZOOM_MAX}
          onClick={() => setZoom((z) => Math.min(MERMAID_ZOOM_MAX, z + MERMAID_ZOOM_STEP))}
        >
          <AddOutline className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
