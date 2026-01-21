import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import img from '../assets/logo.png';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [calendarNotifications, setCalendarNotifications] = useState(0);

  const isActive = (path) => location.pathname === path;

  // Listen for calendar notification updates
  useEffect(() => {
    const handleNotificationUpdate = (event) => {
      setCalendarNotifications(event.detail.count);
    };

    window.addEventListener('calendarNotificationUpdate', handleNotificationUpdate);

    return () => {
      window.removeEventListener('calendarNotificationUpdate', handleNotificationUpdate);
    };
  }, []);

  return (
    <header className="bg-white sticky top-0 z-[110] shadow-sm border-b border-gray-200">
      {/* ✅ ขยาย Navbar ประมาณ 20% ให้ขนาดฟอนต์/โลโก้/เมนูใหญ่ขึ้นสอดคล้องกับแต่ละหน้า และเพิ่มความสูงกล่องเล็กน้อย
          ✅ ใช้ origin-center เพื่อให้เนื้อหาดูอยู่กึ่งกลางแกน Y มากขึ้น */}
      <div className="w-full max-w-[1040px] mx-auto px-0 py-5 flex items-center justify-between scale-[1.2] origin-center">
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
            Calculation
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

          <div
            className="relative cursor-pointer ml-2"
            onClick={() => navigate('/calendar')}
          >
            <i className="bi bi-bell text-xl text-gray-700 hover:text-gray-900 transition-colors"></i>
            {calendarNotifications > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center border-2 border-white">
                {calendarNotifications > 99 ? '99+' : calendarNotifications}
              </span>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
