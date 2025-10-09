import { NavLink, useLocation } from "react-router-dom";

const Header = () => {
  const location = useLocation();
  return (
    <header className="px-4 py-2 border-b border-gray-200">
      <div className="container mx-auto flex justify-between items-center">
        <NavLink to="/">
          <img src="/images/logo.png" alt="The Chumbo" className="h-10" />
        </NavLink>
        <menu className="flex gap-4 text-sm">
          <li>
            <NavLink
              to="/"
              className={({ isActive }) => {
                const isHomePage =
                  location.pathname === "/" ||
                  location.pathname === "/standings" ||
                  location.pathname === "/breakdown" ||
                  location.pathname === "/top-scores" ||
                  location.pathname.startsWith("/schedule-comparison");
                return `${
                  isActive || isHomePage
                    ? "text-blue-600"
                    : "text-gray-600 hover:text-gray-900"
                } font-medium`;
              }}
            >
              Records
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
              to="/players"
              className={({ isActive }) =>
                `${
                  isActive
                    ? "text-blue-600"
                    : "text-gray-600 hover:text-gray-900"
                } font-medium`
              }
            >
              Players
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/managers"
              className={({ isActive }) =>
                `${
                  isActive
                    ? "text-blue-600"
                    : "text-gray-600 hover:text-gray-900"
                } font-medium`
              }
            >
              Managers
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/h2h"
              className={({ isActive }) =>
                `${
                  isActive
                    ? "text-blue-600"
                    : "text-gray-600 hover:text-gray-900"
                } font-medium`
              }
            >
              H2H
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
