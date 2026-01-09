import { Routes, Route } from "react-router-dom";
import { Navbar, SuggestionPage, DRCal, DRList, CalendarPage } from "./components";

function App() {
  return (
    <>
      <Navbar />   {/* ✅ Navbar อยู่ที่นี่ → ทุกหน้าแสดง Navbar */}
      
      <Routes>
        <Route path="/" element={<DRList />} />
        <Route path="/drlist" element={<DRList />} />
        <Route path="/caldr" element={<DRCal />} />
        <Route path="/suggestion" element={<SuggestionPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
      </Routes>
    </>
  );
}

export default App;
