import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import { LINK_CLASS, hasPlayerPage, hasSeasonPage } from "./linkHelpers";

/** Swallow a click so it does not also fire an ancestor's `onClick`. */
const isolateClick = (event: MouseEvent) => event.stopPropagation();

interface PlayerLinkProps {
  playerId: string | number | null | undefined;
  children: ReactNode;
  /** Applied to the anchor. Defaults to {@link LINK_CLASS}. */
  className?: string;
  /** Applied to the plain-text fallback when the id has no page. */
  fallbackClassName?: string;
  /**
   * Set where an ancestor carries its own `onClick` (a clickable row, a filter
   * toggle) so following the link does not also trigger it.
   */
  isolate?: boolean;
  /** Tooltip for the link. Deliberately not reused on the plain-text fallback:
   * a title like "— player page" would be a lie there. */
  title?: string;
  /** Tooltip for the plain-text fallback, when one is wanted. */
  fallbackTitle?: string;
}

/**
 * A player name that navigates to the player page, or the same name as plain
 * text when there is no page to navigate to.
 */
export const PlayerLink = ({
  playerId,
  children,
  className = LINK_CLASS,
  fallbackClassName = "",
  isolate = false,
  title,
  fallbackTitle,
}: PlayerLinkProps) => {
  if (!hasPlayerPage(playerId)) {
    return (
      <span className={fallbackClassName} title={fallbackTitle}>
        {children}
      </span>
    );
  }

  return (
    <Link
      to={`/players/${playerId}`}
      className={className}
      onClick={isolate ? isolateClick : undefined}
      title={title}
    >
      {children}
    </Link>
  );
};

interface ManagerLinkProps {
  /** Sleeper owner id, straight off a roster. */
  ownerId?: string | null;
  /** Internal manager id from managers.json, when the caller already has it. */
  managerId?: string | null;
  children: ReactNode;
  className?: string;
  fallbackClassName?: string;
  isolate?: boolean;
  title?: string;
  fallbackTitle?: string;
}

/**
 * A team or manager name that navigates to the manager page. Pass `ownerId`
 * (the Sleeper id a roster carries) or `managerId` (the internal id).
 */
export const ManagerLink = ({
  ownerId,
  managerId,
  children,
  className = LINK_CLASS,
  fallbackClassName = "",
  isolate = false,
  title,
  fallbackTitle,
}: ManagerLinkProps) => {
  const resolved =
    managerId ?? (ownerId ? getManagerIdBySleeperOwnerId(ownerId) : undefined);

  if (!resolved) {
    return (
      <span className={fallbackClassName} title={fallbackTitle}>
        {children}
      </span>
    );
  }

  return (
    <Link
      to={`/managers/${resolved}`}
      className={className}
      onClick={isolate ? isolateClick : undefined}
      title={title}
    >
      {children}
    </Link>
  );
};

interface SeasonLinkProps {
  year: number | string;
  children: ReactNode;
  /** Which season tab to land on. Standings is the season's front door. */
  tab?: string;
  className?: string;
  /** Applied to the plain-text fallback when the season has no page. */
  fallbackClassName?: string;
  isolate?: boolean;
  title?: string;
}

/** A year that navigates to that season, or plain text if there is no season. */
export const SeasonLink = ({
  year,
  children,
  tab = "standings",
  className = LINK_CLASS,
  fallbackClassName = "",
  isolate = false,
  title,
}: SeasonLinkProps) => {
  if (!hasSeasonPage(year)) {
    return <span className={fallbackClassName}>{children}</span>;
  }

  return (
    <Link
      to={`/seasons/${year}/${tab}`}
      className={className}
      onClick={isolate ? isolateClick : undefined}
      title={title}
    >
      {children}
    </Link>
  );
};
