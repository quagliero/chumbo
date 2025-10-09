import { IntlProvider } from "use-intl";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import "./App.css";
import Header from "./presentation/components/Header/Header";

// Lazy load heavy components
const Home = lazy(() => import("./presentation/pages/home"));
const Wiki = lazy(() => import("./presentation/pages/wiki"));
const Settings = lazy(() => import("./presentation/pages/settings"));
const History = lazy(() => import("./presentation/pages/history"));
const Rules = lazy(() => import("./presentation/pages/rules"));
const ManagerDetail = lazy(() => import("./presentation/pages/managerDetail"));
const Managers = lazy(() => import("./presentation/pages/managers"));
const PlayerDetail = lazy(() => import("./presentation/pages/playerDetail"));
const Players = lazy(() => import("./presentation/pages/players"));

// Lazy load WikiOverview separately
const WikiOverview = lazy(() =>
  import("./presentation/pages/wiki").then((module) => ({
    default: module.WikiOverview,
  }))
);

function App() {
  return (
    <IntlProvider locale="en">
      <Router>
        <Header />
        <div className="px-4">
          <main className="mx-auto my-4">
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-2 text-gray-600">Loading...</span>
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/:tab" element={<Home />} />
                <Route path="/:tab/:subTab" element={<Home />} />
                <Route path="/schedule-comparison/:view" element={<Home />} />
                <Route path="/wiki" element={<Wiki />}>
                  <Route index element={<WikiOverview />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="rules" element={<Rules />} />
                  {/* Add more wiki sub-routes here */}
                </Route>
                <Route path="/history" element={<History />} />
                <Route path="/history/:year/:tab" element={<History />} />
                <Route
                  path="/history/:year/:tab/:week/:matchupId"
                  element={<History />}
                />
                <Route path="/managers" element={<Managers />} />
                <Route
                  path="/managers/:managerId"
                  element={<ManagerDetail />}
                />
                <Route path="/players" element={<Players />} />
                <Route path="/players/:playerId" element={<PlayerDetail />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </Router>
    </IntlProvider>
  );
}

export default App;
