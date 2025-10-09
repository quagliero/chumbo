import React from "react";

// Sorting icon component for consistent styling
export const SortIcon: React.FC<{
  sortDirection?: "asc" | "desc" | false;
  className?: string;
}> = ({ sortDirection, className = "" }) => {
  return (
    <span className={`text-gray-400 ${className}`}>
      {sortDirection === "asc" ? "↑" : sortDirection === "desc" ? "↓" : "↕"}
    </span>
  );
};

interface TableProps {
  children: React.ReactNode;
  className?: string;
}

interface TableHeaderProps {
  children: React.ReactNode;
  className?: string;
}

interface TableBodyProps {
  children: React.ReactNode;
  className?: string;
}

interface TableRowProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

interface TableCellProps {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
  style?: React.CSSProperties;
}

interface TableHeaderCellProps {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
  onClick?: (event: unknown) => void;
  isSorted?: boolean;
}

export const Table: React.FC<TableProps> = ({ children, className = "" }) => {
  return (
    <div className="overflow-x-auto">
      <table className={`min-w-full divide-y divide-gray-200 ${className}`}>
        {children}
      </table>
    </div>
  );
};

export const TableHeader: React.FC<TableHeaderProps> = ({
  children,
  className = "",
}) => {
  return <thead className={`bg-gray-50 ${className}`}>{children}</thead>;
};

export const TableBody: React.FC<TableBodyProps> = ({
  children,
  className = "",
}) => {
  return (
    <tbody className={`bg-white divide-y divide-gray-200 ${className}`}>
      {children}
    </tbody>
  );
};

export const TableRow: React.FC<TableRowProps> = ({
  children,
  className = "",
  onClick,
}) => {
  const baseClasses = "hover:bg-gray-50";
  const clickableClasses = onClick ? "cursor-pointer" : "";

  return (
    <tr
      className={`${baseClasses} ${clickableClasses} ${className}`}
      onClick={onClick}
    >
      {children}
    </tr>
  );
};

export const TableHeaderCell: React.FC<TableHeaderCellProps> = ({
  children,
  className = "",
  colSpan,
  onClick,
  isSorted = false,
}) => {
  const baseClasses =
    "px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";
  const sortedClasses = isSorted ? "bg-gray-100" : "";

  return (
    <th
      className={`${baseClasses} ${sortedClasses} ${className}`}
      colSpan={colSpan}
      onClick={onClick}
    >
      {children}
    </th>
  );
};

export const TableCell: React.FC<TableCellProps> = ({
  children,
  className = "",
  colSpan,
  style,
}) => {
  return (
    <td
      className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 ${className}`}
      colSpan={colSpan}
      style={style}
    >
      {children}
    </td>
  );
};

// Convenience wrapper for common table structure
interface StandardTableProps {
  headers: Array<{
    key: string;
    label: string;
    className?: string;
  }>;
  rows: Array<{
    key: string;
    cells: Array<{
      content: React.ReactNode;
      className?: string;
    }>;
    className?: string;
    onClick?: () => void;
  }>;
  className?: string;
}

export const StandardTable: React.FC<StandardTableProps> = ({
  headers,
  rows,
  className = "",
}) => {
  return (
    <Table className={className}>
      <TableHeader>
        <TableRow>
          {headers.map((header) => (
            <TableHeaderCell key={header.key} className={header.className}>
              {header.label}
            </TableHeaderCell>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={row.key}
            className={row.className}
            onClick={row.onClick}
          >
            {row.cells.map((cell, index) => (
              <TableCell key={index} className={cell.className}>
                {cell.content}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
