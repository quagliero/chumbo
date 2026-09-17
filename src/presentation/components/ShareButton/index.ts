/**
 * The share flow (G3 + G4).
 *
 * G1 renders a card to a PNG. This turns that into something a person can do:
 * a native share sheet on a phone, the clipboard on a desktop, a download where
 * neither exists.
 *
 * ```tsx
 * import { ShareButton } from "@/presentation/components/ShareButton";
 *
 * <ShareButton card={() => finalScoreCard(props)} />
 * ```
 *
 * The card is a `ShareCard` from G1, or a function returning one — pass a
 * function if building it costs anything (an avatar fetch, say), because then it
 * only happens when somebody clicks.
 *
 * **The renderer is not imported here.** It arrives through `import()` inside
 * the click handler, so a page carrying a share button ships the button and
 * nothing else; the `share` chunk downloads when it is needed. Keep it that way
 * — a static import from `../ShareCard` in any of these files puts 25 kB of
 * rasteriser on the critical path of every page that shares anything.
 *
 * `shareCapabilities.ts` holds the path decision as a pure function, and
 * `shareOutcome.ts` turns anything thrown into a sentence. Both are tested
 * directly; between them they are the whole of the behaviour worth asserting.
 */

export { ShareButton, type ShareButtonProps } from "./ShareButton";
export {
  useShareCard,
  type ShareCardInput,
  type ShareState,
  type ShareStatus,
  type UseShareCardOptions,
} from "./useShareCard";
export {
  chooseSharePath,
  readShareEnvironment,
  shareActionLabel,
  type ShareCapabilities,
  type ShareDecision,
  type ShareFallbackReason,
  type SharePath,
} from "./shareCapabilities";
export {
  classifyShareError,
  fallbackMessage,
  successMessage,
  type ShareFailure,
} from "./shareOutcome";
