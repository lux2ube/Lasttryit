import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "@fontsource/cairo/arabic-400.css";
import "@fontsource/cairo/arabic-700.css";
import "@fontsource/cairo/arabic-800.css";
import "@fontsource/cairo/arabic-900.css";

createRoot(document.getElementById("root")!).render(<App />);
