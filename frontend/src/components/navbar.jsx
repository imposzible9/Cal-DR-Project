import { Link, useNavigate, useLocation } from 'react-router-dom';
import img from '../assets/logo.png';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <header className="bg-white sticky top-0 z-[110] shadow-sm border-b border-gray-200">
      {/* ✅ ขยาย Navbar ประมาณ 20% ให้ขนาดฟอนต์/โลโก้/เมนูใหญ่ขึ้นสอดคล้องกับแต่ละหน้า และเพิ่มความสูงกล่องเล็กน้อย
          ✅ ใช้ origin-center เพื่อให้เนื้อหาดูอยู่กึ่งกลางแกน Y มากขึ้น */}
      <div className="w-full max-w-[1040px] mx-auto px-0 py-5 flex items-center justify-between scale-[1.2] origin-center relative">
        {/* Logo */}
        <div
          className="cursor-pointer shrink-0"
          onClick={() => navigate('/')}
        >
          <img
            className="h-10"
            src={img}
            alt="Logo"
          />
        </div>

        {/* Navigation menu */}
        <nav className="flex items-center gap-8">
          <Link
            to="/drlist"
            className={`text-sm font-medium transition-colors ${location.pathname === '/' || isActive('/drlist')
              ? 'text-blue-500'
              : 'text-gray-700 hover:text-gray-900'
              }`}
          >
            DR List
          </Link>

          <Link
            to="/caldr"
            className={`text-sm font-medium transition-colors ${isActive('/caldr') ? 'text-blue-500' : 'text-gray-700 hover:text-gray-900'}`}
          >
            Calculation DR
          </Link>

          <Link
            to="/suggestion"
            className={`text-sm font-medium transition-colors ${isActive('/suggestion') ? 'text-blue-500' : 'text-gray-700 hover:text-gray-900'}`}
          >
            Suggestion
          </Link>

          <Link
            to="/calendar"
            className={`text-sm font-medium transition-colors ${isActive('/calendar') ? 'text-blue-500' : 'text-gray-700 hover:text-gray-900'}`}
          >
            Calendar
          </Link>

          <Link
            to="/news"
            className={`text-sm font-medium transition-colors ${isActive('/news') ? 'text-blue-500' : 'text-gray-700 hover:text-gray-900'}`}
          >
            News
          </Link>
        </nav>

      </div>

      {/* Stats Link - Far Right (Screen Edge) */}
      <Link
        to="/stats"
        className={`absolute right-6 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-blue-600 transition-colors ${isActive('/stats') ? 'text-blue-600' : ''}`}
        title="Stats"
      >
        <i className="bi bi-file-earmark-text text-2xl"></i>
      </Link>
    </header>
  );
};

export default Navbar;

