/** A small coloured label: who won a game, or W/L/T. */
const Pill = ({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) => (
  <span className={`px-2 py-1 rounded text-xs ${className}`}>{children}</span>
);

export default Pill;
