import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { managers } from "../../data";
import H2HContent from "../components/H2HContent/H2HContent";

export default function H2H() {
  const [selectedManagerA, setSelectedManagerA] = useState<string>("");
  const [selectedManagerB, setSelectedManagerB] = useState<string>("");
  const navigate = useNavigate();

  const handleCompare = () => {
    if (
      selectedManagerA &&
      selectedManagerB &&
      selectedManagerA !== selectedManagerB
    ) {
      navigate(`/h2h/${selectedManagerA}/${selectedManagerB}`);
    }
  };

  const handleManagerASelect = (managerId: string) => {
    setSelectedManagerA(managerId);
    // If both managers are selected, automatically navigate
    if (selectedManagerB && managerId !== selectedManagerB) {
      navigate(`/h2h/${managerId}/${selectedManagerB}`);
    }
  };

  const handleManagerBSelect = (managerId: string) => {
    setSelectedManagerB(managerId);
    // If both managers are selected, automatically navigate
    if (selectedManagerA && managerId !== selectedManagerA) {
      navigate(`/h2h/${selectedManagerA}/${managerId}`);
    }
  };

  // If both managers are selected, show the content directly
  if (
    selectedManagerA &&
    selectedManagerB &&
    selectedManagerA !== selectedManagerB
  ) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => {
                  setSelectedManagerA("");
                  setSelectedManagerB("");
                }}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                ← Back to Manager Selection
              </button>
            </div>
          </div>
        </div>
        <H2HContent managerA={selectedManagerA} managerB={selectedManagerB} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Head-to-Head Comparison
        </h1>
        <p className="text-gray-600">
          Select two managers to compare their head-to-head record
        </p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            Select Managers
          </h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Manager A Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Manager A
              </label>
              <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-2">
                {managers.map((manager) => (
                  <button
                    key={manager.id}
                    onClick={() => handleManagerASelect(manager.id)}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                      selectedManagerA === manager.id
                        ? "bg-blue-100 text-blue-800 border border-blue-300"
                        : "hover:bg-gray-50"
                    } ${
                      selectedManagerB === manager.id
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                    disabled={selectedManagerB === manager.id}
                  >
                    <div className="font-medium">{manager.name}</div>
                    <div className="text-xs text-gray-500">
                      {manager.teamName}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Manager B Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Manager B
              </label>
              <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-2">
                {managers.map((manager) => (
                  <button
                    key={manager.id}
                    onClick={() => handleManagerBSelect(manager.id)}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                      selectedManagerB === manager.id
                        ? "bg-blue-100 text-blue-800 border border-blue-300"
                        : "hover:bg-gray-50"
                    } ${
                      selectedManagerA === manager.id
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                    disabled={selectedManagerA === manager.id}
                  >
                    <div className="font-medium">{manager.name}</div>
                    <div className="text-xs text-gray-500">
                      {manager.teamName}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Compare Button */}
          <div className="mt-6 text-center">
            <button
              onClick={handleCompare}
              disabled={
                !selectedManagerA ||
                !selectedManagerB ||
                selectedManagerA === selectedManagerB
              }
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                selectedManagerA &&
                selectedManagerB &&
                selectedManagerA !== selectedManagerB
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              Compare Managers
            </button>
          </div>

          {/* Selected Managers Display */}
          {(selectedManagerA || selectedManagerB) && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Selected Managers:
              </h3>
              <div className="flex items-center justify-center space-x-4">
                {selectedManagerA && (
                  <div className="text-center">
                    <div className="font-medium text-gray-900">
                      {managers.find((m) => m.id === selectedManagerA)?.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {
                        managers.find((m) => m.id === selectedManagerA)
                          ?.teamName
                      }
                    </div>
                  </div>
                )}
                {selectedManagerA && selectedManagerB && (
                  <div className="text-gray-400">vs</div>
                )}
                {selectedManagerB && (
                  <div className="text-center">
                    <div className="font-medium text-gray-900">
                      {managers.find((m) => m.id === selectedManagerB)?.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {
                        managers.find((m) => m.id === selectedManagerB)
                          ?.teamName
                      }
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
