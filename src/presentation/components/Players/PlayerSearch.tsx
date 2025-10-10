interface PlayerSearchProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

const PlayerSearch = ({ searchTerm, onSearchChange }: PlayerSearchProps) => {
  return (
    <div className="mb-6">
      <div className="relative">
        <input
          type="text"
          placeholder="Search by name, position, team, or jersey number..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full max-w-3xl px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg
            className="h-5 w-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default PlayerSearch;
