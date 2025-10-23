import { IntlProvider } from "use-intl";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import "./App.css";
import Header from "@/presentation/components/Header/Header";
import ScrollToTop from "@/presentation/components/ScrollToTop/ScrollToTop";

// Lazy load heavy components
const Home = lazy(() => import("@/presentation/pages/home"));
const Wiki = lazy(() => import("@/presentation/pages/wiki"));
const Settings = lazy(() => import("@/presentation/pages/settings"));
const History = lazy(() => import("@/presentation/pages/history"));
const Rules = lazy(() => import("@/presentation/pages/rules"));
const ManagerDetail = lazy(() => import("@/presentation/pages/managerDetail"));
const Managers = lazy(() => import("@/presentation/pages/managers"));
const PlayerDetail = lazy(() => import("@/presentation/pages/playerDetail"));
const Players = lazy(() => import("@/presentation/pages/players"));
const H2H = lazy(() => import("@/presentation/pages/h2h"));
const H2HDetail = lazy(() => import("@/presentation/pages/h2hDetail"));
const Stats = lazy(() => import("@/presentation/pages/stats"));

// Lazy load WikiOverview separately
const WikiOverview = lazy(() =>
  import("@/presentation/pages/wiki").then((module) => ({
    default: module.WikiOverview,
  }))
);

function App() {
  return (
    <IntlProvider locale="en">
      <Router>
        <ScrollToTop />
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
                <Route path="/seasons" element={<History />} />
                <Route path="/seasons/:year/:tab" element={<History />} />
                <Route
                  path="/seasons/:year/:tab/:week/:matchupId"
                  element={<History />}
                />
                <Route path="/managers" element={<Managers />} />
                <Route
                  path="/managers/:managerId"
                  element={<ManagerDetail />}
                />
                <Route
                  path="/managers/:managerId/:tab"
                  element={<ManagerDetail />}
                />
                <Route
                  path="/managers/:managerId/:tab/:section"
                  element={<ManagerDetail />}
                />
                <Route path="/players" element={<Players />} />
                <Route path="/players/:playerId" element={<PlayerDetail />} />
                <Route path="/h2h" element={<H2H />} />
                <Route
                  path="/h2h/:managerA/:managerB"
                  element={<H2HDetail />}
                />
                <Route path="/explorer" element={<Stats />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </Router>
    </IntlProvider>
  );
}

export default App;
