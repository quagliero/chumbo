import { seasons } from "@/data";
import type { PreviewSide, Result } from "@/utils/matchupPreview";
import { getUserAvatarUrl, getUserByOwnerId } from "@/utils/userAvatar";

/** A team's picture that season, or its initial. */
export const TeamAvatar = ({
  year,
  side,
  size = "w-8 h-8",
}: {
  year: number;
  side: PreviewSide;
  size?: string;
}) => {
  const url = getUserAvatarUrl(getUserByOwnerId(side.ownerId, seasons[year]?.users));
  return url ? (
    <img
      src={url}
      alt=""
      className={`${size} flex-none rounded-full object-cover`}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  ) : (
    <div
      aria-hidden="true"
      className={`${size} flex flex-none items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-500`}
    >
      {side.name.charAt(0).toUpperCase()}
    </div>
  );
};

const RESULT_STYLE: Record<Result, string> = {
  W: "bg-green-100 text-green-800",
  L: "bg-red-100 text-red-800",
  T: "bg-gray-100 text-gray-700",
};

/** The last five results as chips, oldest first, so the newest is on the right. */
export const FormGuide = ({ form }: { form: readonly Result[] }) =>
  form.length === 0 ? (
    <span className="text-xs text-ink-faint">No games yet</span>
  ) : (
    <span className="inline-flex gap-0.5" aria-label={`Form: ${form.join(" ")}`}>
      {form.map((result, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${RESULT_STYLE[result]}`}
        >
          {result}
        </span>
      ))}
    </span>
  );
