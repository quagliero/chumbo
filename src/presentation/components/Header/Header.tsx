import { NavLink } from "react-router-dom";

const Header = () => {
  return (
    <header className="px-4 py-2 border-b border-gray-200">
      <div className="container mx-auto flex justify-between items-center">
        <img src="/images/logo.png" alt="The Chumbo" className="h-10" />
        <menu className="flex gap-4 text-sm">
          <li>
            <NavLink
              to="/"
              className={({ isActive }) =>
                `${
                  isActive
                    ? "text-blue-600"
                    : "text-gray-600 hover:text-gray-900"
                } font-medium`
              }
            >
              Standings
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/history"
              className={({ isActive }) =>
                `${
                  isActive
                    ? "text-blue-600"
                    : "text-gray-600 hover:text-gray-900"
                } font-medium`
              }
            >
              History
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/wiki"
              className={({ isActive }) =>
                `${
                  isActive
                    ? "text-blue-600"
                    : "text-gray-600 hover:text-gray-900"
                } font-medium`
              }
            >
              Wiki
            </NavLink>
          </li>
        </menu>
      </div>
    </header>
  );
};

export default Header;
