import { IntlProvider } from "use-intl";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";
import Header from "./presentation/components/Header/Header";
import Home from "./presentation/pages/home";
import Wiki, { WikiOverview } from "./presentation/pages/wiki";
import Settings from "./presentation/pages/settings";
import History from "./presentation/pages/history";
import Rules from "./presentation/pages/rules";

function App() {
  return (
    <IntlProvider locale="en">
      <Router>
        <Header />
        <div className="px-4">
          <main className="mx-auto my-4">
            <Routes>
              <Route path="/" element={<Home />} />
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
            </Routes>
          </main>
        </div>
      </Router>
    </IntlProvider>
  );
}

export default App;
