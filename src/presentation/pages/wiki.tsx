import { Outlet, NavLink } from "react-router-dom";

const WikiOverview = () => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Welcome to The Chumbo Wiki</h2>
      <p className="text-gray-600">
        This wiki contains all the information about The Chumbo fantasy football
        league, including rules, history, and league settings.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-medium mb-3">League Settings</h3>
          <p className="text-gray-600 mb-4">
            Complete documentation of league settings, the scoring system, and
            current season information.
          </p>
          <NavLink
            to="/wiki/settings"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            View Settings →
          </NavLink>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-medium mb-3">League Rules</h3>
          <p className="text-gray-600 mb-4">
            If you're not cheating, you're not trying.
          </p>
          <NavLink
            to="/wiki/rules"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            View Rules →
          </NavLink>
        </div>
      </div>
    </div>
  );
};

const Wiki = () => {
  return (
    <div className="">
      <h1 className="text-3xl font-bold mb-8">Chumbo Wiki</h1>

      {/* Wiki Navigation */}
      <nav className="mb-8">
        <ul className="flex gap-4 border-b border-gray-200">
          <li>
            <NavLink
              to="/wiki"
              end
              className={({ isActive }) =>
                `block pb-2 px-1 border-b-2 font-medium ${
                  isActive
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`
              }
            >
              Overview
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/wiki/settings"
              className={({ isActive }) =>
                `block pb-2 px-1 border-b-2 font-medium ${
                  isActive
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`
              }
            >
              Settings
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/wiki/rules"
              className={({ isActive }) =>
                `block pb-2 px-1 border-b-2 font-medium ${
                  isActive
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`
              }
            >
              Rules{" "}
            </NavLink>
          </li>
          {/* Add more wiki navigation links here */}
        </ul>
      </nav>

      <Outlet />
    </div>
  );
};

export { WikiOverview };
export default Wiki;
