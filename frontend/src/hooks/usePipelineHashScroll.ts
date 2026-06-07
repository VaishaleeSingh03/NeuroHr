"use client";

import { useEffect } from "react";
import { parsePipelineStepFromHash } from "@/lib/hiringPipeline";

/** Scroll to pipeline section from URL hash; optionally expand a step panel. */
export function usePipelineHashScroll(onStepFocus?: (stepId: number) => void) {
  useEffect(() => {
    const run = () => {
      const raw = window.location.hash;
      if (!raw || raw === "#") return;

      const anchor = raw.slice(1);
      const stepId = parsePipelineStepFromHash(raw);
      if (stepId != null) onStepFocus?.(stepId);

      requestAnimationFrame(() => {
        document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };

    run();
    window.addEventListener("hashchange", run);
    return () => window.removeEventListener("hashchange", run);
  }, [onStepFocus]);
}
