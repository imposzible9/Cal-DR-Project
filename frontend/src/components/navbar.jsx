import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import img from '../assets/logo.png';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showStatsIcon, setShowStatsIcon] = useState(false);
  const [calendarNotificationCount, setCalendarNotificationCount] = useState(0);

  // Helper to count unseen earnings from localStorage
  const getUnseenEarningsCount = () => {
    try {
      const seen = new Set(JSON.parse(localStorage.getItem('calendar_seen_earnings') || '[]'));
      // Optionally, get all earnings from localStorage or backend
      const allEarnings = JSON.parse(localStorage.getItem('calendar_all_earnings') || '[]');
      if (!allEarnings.length) return 0;
      return allEarnings.filter(e => !seen.has(`${e.ticker}-${e.date}`)).length;
    } catch {
      return 0;
    }
  };

  const isActive = (path) => location.pathname === path;

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  // Read persisted flag and listen for updates
  useEffect(() => {
    try {
      const v = localStorage.getItem('stats_logged_in');
      if (v) setShowStatsIcon(true);
    } catch (e) {}

    const handler = () => setShowStatsIcon(true);
    window.addEventListener('stats:visited', handler);

    // Listen for calendar notification updates
    const calendarHandler = (e) => {
      setCalendarNotificationCount(e.detail?.count || 0);
    };
    window.addEventListener('calendarNotificationUpdate', calendarHandler);

    // On mount, check unseen earnings from localStorage
    setCalendarNotificationCount(getUnseenEarningsCount());

    return () => {
      window.removeEventListener('stats:visited', handler);
      window.removeEventListener('calendarNotificationUpdate', calendarHandler);
    };
  }, []);

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  return (
    <header className="bg-white sticky top-0 z-[12000] shadow-sm border-b border-gray-200">
      <div className="w-full max-w-[1040px] mx-auto px-4 md:px-0 py-3 md:py-5 flex items-center justify-between relative lg:scale-[1.2] lg:origin-center">

        {/* Logo */}
        <div
          className="cursor-pointer shrink-0 flex items-center gap-2"
          onClick={() => { navigate('/'); closeMenu(); }}
        >
          <img
            className="h-8 md:h-10"
            src={img}
            alt="Logo"
          />
        </div>

        {/* Mobile Menu Button - Left aligned on mobile relative to siblings if needed, but usually right. 
            Here we place it to the right for standard UX */}
        <div className="md:hidden flex items-center gap-4">
          {showStatsIcon && (
            <Link
              to="/stats"
              className={`text-gray-400 hover:text-blue-600 transition-colors ${isActive('/stats') ? 'text-blue-600' : ''}`}
              onClick={closeMenu}
              title="Stats"
            >
              <i className="bi bi-file-earmark-text text-xl"></i>
            </Link>
          )}
          <button
            onClick={toggleMenu}
            className="text-gray-700 hover:text-gray-900 focus:outline-none"
          >
            {isMenuOpen ? (
              <i className="bi bi-x text-3xl"></i>
            ) : (
              <i className="bi bi-list text-3xl"></i>
            )}
          </button>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8">
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
            className={`relative text-sm font-medium transition-colors ${isActive('/calendar') ? 'text-blue-500' : 'text-gray-700 hover:text-gray-900'}`}
          >
            Calendar
            {calendarNotificationCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 rounded-full w-3 h-3 shadow-md"></span>
            )}
          </Link>

          <Link
            to="/news"
            className={`text-sm font-medium transition-colors ${isActive('/news') ? 'text-blue-500' : 'text-gray-700 hover:text-gray-900'}`}
          >
            News
          </Link>
        </nav>

      </div>

      {/* Stats Link - Far Right (Screen Edge) - Desktop Only */}
      {showStatsIcon && (
        <Link
          to="/stats"
          className={`hidden md:block absolute right-6 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-blue-600 transition-colors ${isActive('/stats') ? 'text-blue-600' : ''}`}
          title="Stats"
        >
          <i className="bi bi-file-earmark-text text-2xl"></i>
        </Link>
      )}

      {/* Mobile Menu Dropdown */}
      {isMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-white border-b border-gray-200 shadow-lg py-4 px-4 flex flex-col gap-4">
          <Link
            to="/drlist"
            className={`text-base font-medium transition-colors ${location.pathname === '/' || isActive('/drlist')
              ? 'text-blue-500'
              : 'text-gray-700'
              }`}
            onClick={closeMenu}
          >
            DR List
          </Link>

          <Link
            to="/caldr"
            className={`text-base font-medium transition-colors ${isActive('/caldr') ? 'text-blue-500' : 'text-gray-700'}`}
            onClick={closeMenu}
          >
            Calculation DR
          </Link>

          <Link
            to="/suggestion"
            className={`text-base font-medium transition-colors ${isActive('/suggestion') ? 'text-blue-500' : 'text-gray-700'}`}
            onClick={closeMenu}
          >
            Suggestion
          </Link>

          <Link
            to="/calendar"
            className={`text-base font-medium transition-colors ${isActive('/calendar') ? 'text-blue-500' : 'text-gray-700'}`}
            onClick={closeMenu}
          >
            Calendar
          </Link>

          <Link
            to="/news"
            className={`text-base font-medium transition-colors ${isActive('/news') ? 'text-blue-500' : 'text-gray-700'}`}
            onClick={closeMenu}
          >
            News
          </Link>
        </div>
      )}
    </header>
  );
};

export default Navbar;

