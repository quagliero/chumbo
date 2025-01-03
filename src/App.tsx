import { IntlProvider } from "use-intl";
import "./App.css";
import AllTimeTable from "./presentation/components/AllTimeTable";

function App() {
  return (
    <IntlProvider locale="en">
      <AllTimeTable />
    </IntlProvider>
  );
}

export default App;
