import { IntlProvider } from "use-intl";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";
import Header from "./presentation/components/Header/Header";
import Home from "./presentation/pages/home";
import Wiki, { WikiOverview } from "./presentation/pages/wiki";
import Settings from "./presentation/pages/settings";
import History from "./presentation/pages/history";
import Rules from "./presentation/pages/rules";
import ManagerDetail from "./presentation/pages/managerDetail";
import Managers from "./presentation/pages/managers";
import PlayerDetail from "./presentation/pages/playerDetail";
import Players from "./presentation/pages/players";

function App() {
  return (
    <IntlProvider locale="en">
      <Router>
        <Header />
        <div className="px-4">
          <main className="mx-auto my-4">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/:tab" element={<Home />} />
              <Route path="/:tab/:subTab" element={<Home />} />
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
              <Route path="/managers/:managerId" element={<ManagerDetail />} />
              <Route path="/players" element={<Players />} />
              <Route path="/players/:playerId" element={<PlayerDetail />} />
            </Routes>
          </main>
        </div>
      </Router>
    </IntlProvider>
  );
}

export default App;
