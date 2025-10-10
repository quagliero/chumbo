import { useState } from "react";
import { PlayerSearch, PlayerResults } from "@/presentation/components/Players";
import { usePlayerSearch } from "@/hooks/players";

const Players = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const searchResults = usePlayerSearch(searchTerm);

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Players</h1>
        <p className="text-gray-600">
          Search for players who have played in The Chumbo
        </p>
      </div>

      <PlayerSearch searchTerm={searchTerm} onSearchChange={setSearchTerm} />
      <PlayerResults searchResults={searchResults} searchTerm={searchTerm} />
    </div>
  );
};

export default Players;
