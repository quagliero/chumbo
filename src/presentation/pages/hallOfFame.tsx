import { useState } from "react";

interface HOFInductee {
  name: string;
  blurb: string;
}

const hofInductees: Record<number, HOFInductee> = {
  2012: {
    name: "Jacob Hester",
    blurb:
      "Placeholder text for Jacob Hester's Hall of Fame induction in 2012. This will be replaced with the actual blurb.",
  },
  2013: {
    name: "Jamaal Charles",
    blurb:
      "Placeholder text for Jamaal Charles's Hall of Fame induction in 2013. This will be replaced with the actual blurb.",
  },
  2014: {
    name: "Mark Sanchez",
    blurb:
      "Placeholder text for Mark Sanchez's Hall of Fame induction in 2014. This will be replaced with the actual blurb.",
  },
  2015: {
    name: "Eddie Lacy",
    blurb:
      "Placeholder text for Eddie Lacy's Hall of Fame induction in 2015. This will be replaced with the actual blurb.",
  },
  2016: {
    name: "LeGarrette Blount",
    blurb:
      "Placeholder text for LeGarrette Blount's Hall of Fame induction in 2016. This will be replaced with the actual blurb.",
  },
  2017: {
    name: "Todd Gurley",
    blurb:
      "Placeholder text for Todd Gurley's Hall of Fame induction in 2017. This will be replaced with the actual blurb.",
  },
  2018: {
    name: "Robbie Chosen",
    blurb:
      "Placeholder text for Robbie Chosen's Hall of Fame induction in 2018. This will be replaced with the actual blurb.",
  },
  2019: {
    name: "Travis Kelce",
    blurb:
      "Placeholder text for Travis Kelce's Hall of Fame induction in 2019. This will be replaced with the actual blurb.",
  },
  2020: {
    name: "Darren Waller",
    blurb:
      "Placeholder text for Darren Waller's Hall of Fame induction in 2020. This will be replaced with the actual blurb.",
  },
  2021: {
    name: "Braxton Hoyett",
    blurb:
      "Placeholder text for Braxton Hoyett's Hall of Fame induction in 2021. This will be replaced with the actual blurb.",
  },
  2022: {
    name: "Damar Hamlin",
    blurb:
      "Placeholder text for Damar Hamlin's Hall of Fame induction in 2022. This will be replaced with the actual blurb.",
  },
  2023: {
    name: "Christian McCaffrey",
    blurb:
      "Placeholder text for Christian McCaffrey's Hall of Fame induction in 2023. This will be replaced with the actual blurb.",
  },
  2024: {
    name: "Commissioner HD",
    blurb:
      "Placeholder text for Commissioner HD's Hall of Fame induction in 2024. This will be replaced with the actual blurb.",
  },
};

const HallOfFame = () => {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const years = Object.keys(hofInductees)
    .map(Number)
    .sort((a, b) => a - b);

  const handleMemberClick = (year: number) => {
    setSelectedYear(year);
    // Scroll to detail section after a brief delay to ensure state updates
    setTimeout(() => {
      document.getElementById("detail-section")?.scrollIntoView({
        behavior: "smooth",
      });
    }, 100);
  };

  const handleCloseDetail = () => {
    setSelectedYear(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectedMember = selectedYear ? hofInductees[selectedYear] : null;

  return (
    <div className="container mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">Hall of Fame</h1>
        <p className="text-gray-600">Inductees into the Chumbo Hall of Fame</p>
      </div>

      {/* Grid Section */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 mb-16">
        {years.map((year) => {
          const inductee = hofInductees[year];
          const isSelected = selectedYear === year;

          return (
            <div
              key={year}
              className="flex flex-col items-center cursor-pointer group"
              onClick={() => handleMemberClick(year)}
            >
              <div
                className={`relative w-32 h-32 rounded-full overflow-hidden mb-2 transition-all duration-300 ${
                  isSelected
                    ? "ring-4 ring-blue-600 ring-offset-2"
                    : "group-hover:scale-105 group-hover:brightness-110"
                }`}
              >
                <img
                  src={`/images/hof/${year}-icon.jpg`}
                  alt={inductee.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-sm font-medium text-gray-700">{year}</span>
            </div>
          );
        })}
      </div>

      {/* Detail Section */}
      {selectedMember && selectedYear && (
        <div id="detail-section" className="min-h-screen relative">
          {/* Background Image */}
          <div className="absolute inset-0">
            <img
              src={`/images/hof/${selectedYear}-large.jpg`}
              alt={selectedMember.name}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Dark Overlay */}
          <div className="absolute inset-0 bg-black/70"></div>

          {/* Content */}
          <div className="relative z-10 min-h-screen flex items-center justify-center p-8">
            <div className="max-w-2xl mx-auto bg-white rounded-lg p-8 shadow-2xl">
              {/* Close Button */}
              <button
                onClick={handleCloseDetail}
                className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-2xl font-bold"
                aria-label="Close"
              >
                ×
              </button>

              {/* Name */}
              <h2 className="text-3xl font-bold text-gray-800 mb-4">
                {selectedMember.name}
              </h2>

              {/* Year */}
              <p className="text-lg text-gray-600 mb-6">{selectedYear}</p>

              {/* Blurb */}
              <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                {selectedMember.blurb}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HallOfFame;
