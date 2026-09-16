import type { ReactNode } from "react";

/**
 * Classes for a horizontal strip of tabs or controls that must scroll *within
 * itself* on a narrow viewport rather than widening the whole document.
 *
 * Exported for the handful of rows that can't use the component below (e.g. a
 * group nested inside an existing flex row).
 */
export const scrollableRowClasses =
  "flex overflow-x-auto no-scrollbar whitespace-nowrap [&>*]:shrink-0";

type ScrollableTabsProps = {
  /** Element to render. Defaults to `nav`. */
  as?: "nav" | "menu" | "ul" | "div";
  className?: string;
  children: ReactNode;
};

const ScrollableTabs = ({
  as: Tag = "nav",
  className,
  children,
}: ScrollableTabsProps) => (
  <Tag className={[scrollableRowClasses, className].filter(Boolean).join(" ")}>
    {children}
  </Tag>
);

export default ScrollableTabs;
