import { Routes, Route, useLocation } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import { Navbar, SuggestionPage, DRCal, DRList, CalendarPage, News } from "./components";
import { initTracker, trackPageView } from "./utils/tracker";

// Lazy load Stats component
const Stats = lazy(() => import("./components/Stats"));

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
        <Route
          path="/caldr/stats"
          element={
            <Suspense fallback={<div className="p-10 text-center">Loading Dashboard...</div>}>
              <Stats />
            </Suspense>
          }
        />
        <Route
          path="/stats"
          element={
            <Suspense fallback={<div className="p-10 text-center">Loading Dashboard...</div>}>
              <Stats />
            </Suspense>
          }
        />
        <Route path="*" element={<DRList />} />
      </Routes>
    </>
  );
}

export default App;
