import { lazy, Suspense } from "react";

/**
 * D3 lives in the `charts` chunk (see vite.config.ts), like the power ribbon.
 * Lazy so the chunk is fetched when someone actually opens the matrix.
 */
const H2HMatrix = lazy(() =>
  import("@/presentation/components/Chart/H2HMatrix/H2HMatrix").then((m) => ({
    default: m.H2HMatrix,
  }))
);

/**
 * Head to head (D3).
 *
 * This page used to be two scrolling lists of seventeen names and a "vs"
 * between them. It could answer one question, and only if you already knew
 * which one to ask. The matrix answers all 136 of them at once — and the ones
 * nobody would have thought to ask are the interesting ones.
 */
export default function H2H() {
  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          Head to head
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Every rivalry in Chumbo history. Read across a row for one manager
          against the whole field.
        </p>
      </div>

      <Suspense fallback={<div className="h-96" />}>
        <H2HMatrix />
      </Suspense>
    </div>
  );
}
