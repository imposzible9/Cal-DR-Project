import { Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Navbar, SuggestionPage, DRCal, DRList, CalendarPage } from "./components";
import { initTracker, trackPageView } from "./utils/tracker";

// Page name mapping
const PAGE_NAMES = {
  "/": "DR List",
  "/drlist": "DR List",
  "/caldr": "DR Calculator",
  "/suggestion": "Suggestions",
  "/calendar": "Calendar"
};

function App() {
  const location = useLocation();

  // Initialize tracker on app mount
  useEffect(() => {
    initTracker();
  }, []);

  // Track page views on route change
  useEffect(() => {
    const pageName = PAGE_NAMES[location.pathname] || location.pathname;
    trackPageView(pageName);
  }, [location.pathname]);

  return (
    <>
      <Navbar />   {/* ✅ Navbar อยู่ที่นี่ → ทุกหน้าแสดง Navbar */}

      <Routes>
        <Route path="/" element={<DRList />} />
        <Route path="/drlist" element={<DRList />} />
        <Route path="/caldr" element={<DRCal />} />
        <Route path="/suggestion" element={<SuggestionPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/news" element={<News />} />
      </Routes>
    </>
  );
}

export default App;

