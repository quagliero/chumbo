import { Link } from "react-router-dom";
import {
  narrate,
  recordListHref,
  type NarrativeSubject,
  type Note,
} from "@/utils/narrative/narrate";
import { getManagerAccent } from "@/domain/managerColors";
import { ShareButton } from "@/presentation/components/ShareButton";
import { useNarrativeStats } from "./useNarrativeStats";

/**
 * The band across the top of a shared record card.
 *
 * NOT the template's default, which is "🚨 NEW LEAGUE RECORD". A rank-1 note
 * says the entry tops the all-time list — it does not say it happened this
 * week, and most of these records are years old. "NEW" on a 2013 record is the
 * template's own warning about not making a weak fact shout, pointed the other
 * way: it would make a true fact shout something false.
 */
const RECORD_KICKER = "\u{1F3C6} CHUMBO RECORD";

/**
 * The share control next to a league record.
 *
 * Only ever rendered for `rank === 1` with a number the stat can stand behind
 * (`Note.recordValue`), which is the whole editorial rule: `recordBrokenCard`
 * is the loudest of the five templates, and a siren next to "the 4th-narrowest
 * win" is how a card ends up claiming more than the site does.
 *
 * The card is a factory, so the rasteriser and the crest are only fetched when
 * somebody clicks — a matchup page that happens to hold a record must not pay
 * 25 kB for the privilege.
 */
const RecordShare = ({ note }: { note: Note }) => (
  <ShareButton
    iconOnly
    what="record card"
    className="ml-auto self-center"
    card={async () => {
      const [{ recordBrokenCard, seasonMeta }, { embedImage }] =
        await Promise.all([
          import("@/presentation/components/ShareCard/templates"),
          import("@/presentation/components/ShareCard"),
        ]);
      return recordBrokenCard({
        value: note.recordValue as string,
        holder: note.holder,
        when:
          note.year === undefined
            ? undefined
            : seasonMeta(note.year, note.week),
        kicker: RECORD_KICKER,
        // One accent, and only when the record belongs to exactly one
        // manager. A pairing or a player gets the template's neutral ink
        // rather than somebody else's colour.
        accent: note.managerId ? getManagerAccent(note.managerId) : undefined,
        crest: await embedImage("/images/logo.png"),
        // The sentence and its caveat, both from E7. The template renders the
        // 2019 flag as its own line with a warning sign, which is why this
        // card in particular must never be handed a stripped note.
        note: { text: note.text, approximate: note.approximate },
      });
    }}
  />
);

/**
 * The sentences a page has earned (E7).
 *
 * Renders nothing at all when there is nothing notable, which is the whole
 * discipline: a rail that always says something trains people to stop reading
 * it, and the point of this is that when it speaks, it is worth pasting into
 * the group chat.
 *
 * Reads the precomputed file without suspending. A note is a garnish — a
 * matchup page must not wait on it, and a page that has not loaded the file
 * simply has no notes yet.
 *
 * A note that is rank 1 of its list is a league record, and gets a share
 * button: that is where `recordBrokenCard` lives, because the rail is already
 * the site's own judgement about what is worth saying out loud.
 */
export const NarrativeNotes = ({
  subject,
  limit = 3,
  className,
}: {
  subject: NarrativeSubject;
  limit?: number;
  className?: string;
}) => {
  const stats = useNarrativeStats();
  const notes = narrate(stats, subject, { limit });
  if (!notes.length) return null;

  return (
    <ul className={`space-y-1.5 ${className ?? ""}`}>
      {notes.map((note) => (
        <li
          key={note.statId}
          className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-ink"
        >
          <span aria-hidden="true" className="text-ink-faint">★</span>
          <span>
            {/* To the ranking the sentence is about, at this row: "the 3rd-
                biggest margin" is only worth clicking if it shows the other
                two. The game itself is one link on from there. */}
            <Link
              to={recordListHref(note.statId, note.rank)}
              className="underline decoration-dotted underline-offset-2 hover:text-ink"
            >
              {note.text}
            </Link>
            {note.rank > 1 && (
              <span className="text-ink-faint">
                {" "}
                ({note.rank} of {note.outOf})
              </span>
            )}
            {/* 2019's per-player data is a reconstruction. A caveated fact
                presented flat is worse than no fact. */}
            {note.approximate && (
              <span
                className="text-ink-faint"
                title="2019's per-player data is reconstructed, not recorded"
              >
                {" "}
                · reconstructed
              </span>
            )}
          </span>
          {/* The record itself, and only the record. */}
          {note.rank === 1 && note.recordValue && <RecordShare note={note} />}
        </li>
      ))}
    </ul>
  );
};
