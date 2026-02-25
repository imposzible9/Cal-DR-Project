import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import img from '../assets/logo.png';
import ThemeToggle from './ThemeToggle';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showStatsIcon, setShowStatsIcon] = useState(false);
  const [calendarNotificationCount, setCalendarNotificationCount] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Check initial theme from localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }

    try {
      const v = localStorage.getItem('stats_logged_in');
      if (v) setShowStatsIcon(true);
    } catch (e) { }

    const handler = () => setShowStatsIcon(true);
    window.addEventListener('stats:visited', handler);

    // Listen for calendar notification updates
    const calendarHandler = (e) => {
      setCalendarNotificationCount(e.detail?.count || 0);
    };
    window.addEventListener('calendarNotificationUpdate', calendarHandler);

    // Helper to count unseen earnings from localStorage
    const getUnseenEarningsCount = () => {
      try {
        const seen = new Set(JSON.parse(localStorage.getItem('calendar_seen_earnings') || '[]'));
        const allEarnings = JSON.parse(localStorage.getItem('calendar_all_earnings') || '[]');
        if (!allEarnings.length) return 0;
        return allEarnings.filter(e => !seen.has(`${e.ticker}-${e.date}`)).length;
      } catch {
        return 0;
      }
    };

    setCalendarNotificationCount(getUnseenEarningsCount());

    return () => {
      window.removeEventListener('stats:visited', handler);
      window.removeEventListener('calendarNotificationUpdate', calendarHandler);
    };
  }, []);

  const toggleDarkMode = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDarkMode(true);
    }
  };

  const isActive = (path) => location.pathname === path;

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  return (
    <header className="bg-white dark:bg-[#10172A] sticky top-0 z-[12000] shadow-sm border-b border-gray-200 dark:border-white/10 dark:border-white/10 transition-colors duration-300">
      <div className="w-full max-w-[1040px] mx-auto px-4 md:px-0 py-3 md:py-5 flex items-center justify-between relative lg:scale-[1.2] lg:origin-center">

        {/* 1. Logo (Left) */}
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

        {/* Mobile Menu Actions */}
        <div className="md:hidden flex items-center gap-4">
          {/* Mobile Dark Mode Switch */}
          <ThemeToggle />

          {showStatsIcon && (
            <Link
              to="/stats"
              className={`text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:text-white transition-colors duration-300 ${isActive('/stats') ? 'text-blue-600' : ''}`}
              onClick={closeMenu}
            >
              <i className="bi bi-file-earmark-text text-xl"></i>
            </Link>
          )}

          {/* Hamburger Icon */}
          <button
            onClick={toggleMenu}
            className="text-gray-700 dark:text-gray-200 dark:text-white hover:text-gray-900 dark:text-white focus:outline-none transition-colors duration-300"
          >
            {isMenuOpen ? (
              <i className="bi bi-x text-3xl"></i>
            ) : (
              <i className="bi bi-list text-3xl"></i>
            )}
          </button>
        </div>

        {/* 2 & 3. Desktop Navigation and Icons (Right) */}
        <div className="hidden md:flex items-center gap-8 justify-end flex-1">
          <nav className="flex flex-row items-center gap-8">
            <Link
              to="/drlist"
              className={`text-sm font-medium transition-colors duration-300 ${location.pathname === '/' || isActive('/drlist')
                ? 'text-blue-500'
                : 'text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:text-white dark:text-white dark:hover:text-gray-300'
                }`}
            >
              DR List
            </Link>

            <Link
              to="/caldr"
              className={`text-sm font-medium transition-colors duration-300 ${isActive('/caldr') ? 'text-blue-500' : 'text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:text-white dark:text-white dark:hover:text-gray-300'}`}
            >
              Calculation DR
            </Link>

            <Link
              to="/suggestion"
              className={`text-sm font-medium transition-colors duration-300 ${isActive('/suggestion') ? 'text-blue-500' : 'text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:text-white dark:text-white dark:hover:text-gray-300'}`}
            >
              Suggestion
            </Link>

            <Link
              to="/calendar"
              className={`relative text-sm font-medium transition-colors duration-300 ${isActive('/calendar') ? 'text-blue-500' : 'text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:text-white dark:text-white dark:hover:text-gray-300'}`}
            >
              Calendar
              {calendarNotificationCount > 0 && (
                <span className="absolute -top-[2px] -right-2.5 bg-red-500 rounded-full w-2.5 h-2.5 border-2 border-white dark:border-[#10172A] shadow-sm"></span>
              )}
            </Link>

            <Link
              to="/news"
              className={`text-sm font-medium transition-colors duration-300 ${isActive('/news') ? 'text-blue-500' : 'text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:text-white dark:text-white dark:hover:text-gray-300'}`}
            >
              News
            </Link>
          </nav>

          <div className="flex items-center justify-end gap-8 shrink-0">
            {/* Optional Stats Icon */}
            {showStatsIcon && (
              <Link
                to="/stats"
                className={`text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:text-white dark:hover:text-blue-400 transition-colors duration-300 ${isActive('/stats') ? 'text-blue-600 dark:text-blue-400' : ''}`}
                title="Stats"
              >
                <i className="bi bi-file-earmark-text text-xl"></i>
              </Link>
            )}

            {/* Dark Mode Switch */}
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-white dark:bg-[#10172A] border-b border-gray-200 dark:border-white/10 dark:border-white/10 shadow-lg py-4 px-4 flex flex-col gap-4">
          <Link
            to="/drlist"
            className={`text-base font-medium transition-colors duration-300 ${location.pathname === '/' || isActive('/drlist')
              ? 'text-blue-500'
              : 'text-gray-700 dark:text-gray-200 dark:text-white'
              }`}
            onClick={closeMenu}
          >
            DR List
          </Link>

          <Link
            to="/caldr"
            className={`text-base font-medium transition-colors duration-300 ${isActive('/caldr') ? 'text-blue-500' : 'text-gray-700 dark:text-gray-200 dark:text-white'}`}
            onClick={closeMenu}
          >
            Calculation DR
          </Link>

          <Link
            to="/suggestion"
            className={`text-base font-medium transition-colors duration-300 ${isActive('/suggestion') ? 'text-blue-500' : 'text-gray-700 dark:text-gray-200 dark:text-white'}`}
            onClick={closeMenu}
          >
            Suggestion
          </Link>

          <Link
            to="/calendar"
            className={`text-base font-medium flex items-center justify-between transition-colors duration-300 ${isActive('/calendar') ? 'text-blue-500' : 'text-gray-700 dark:text-gray-200 dark:text-white'}`}
            onClick={closeMenu}
          >
            Calendar
            {calendarNotificationCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {calendarNotificationCount}
              </span>
            )}
          </Link>

          <Link
            to="/news"
            className={`text-base font-medium transition-colors duration-300 ${isActive('/news') ? 'text-blue-500' : 'text-gray-700 dark:text-gray-200 dark:text-white'}`}
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

