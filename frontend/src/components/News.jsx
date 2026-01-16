import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import img from '../assets/logo.png';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [calendarNotifications, setCalendarNotifications] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when menu is open on mobile
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMenuOpen]);

  return (
    <header className="bg-white sticky top-0 z-[110] shadow-sm border-b border-gray-200">
      {/* Desktop view - unchanged */}
      <div className="hidden lg:block w-full max-w-[1040px] mx-auto px-0 py-5 scale-[1.2] origin-center">
        <div className="flex items-center justify-between">
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
              className={`text-sm font-medium transition-colors ${
                location.pathname === '/' || isActive('/drlist')
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
              className={`text-sm font-medium transition-colors relative ${isActive('/calendar') ? 'text-blue-500' : 'text-gray-700 hover:text-gray-900'}`}
            >
              Calendar
              {calendarNotifications > 0 && (
                <span className="absolute -top-1 right-[-10px] bg-red-500 text-white text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                  {calendarNotifications > 99 ? '99+' : calendarNotifications}
                </span>
              )}
            </Link>
          </nav>
        </div>
      </div>

      {/* Mobile view - hamburger menu */}
      <div className="lg:hidden w-full px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div
            className="cursor-pointer shrink-0"
            onClick={() => navigate('/')}
          >
            <img 
              className="h-8" 
              src={img} 
              alt="Logo" 
            />
          </div>

          {/* Hamburger button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
            aria-label="Toggle menu"
          >
            {isMenuOpen ? (
              // Close icon (X)
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              // Hamburger icon
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile menu dropdown */}
        {isMenuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] top-[57px]"
              onClick={() => setIsMenuOpen(false)}
            />
            
            {/* Menu panel */}
            <nav className="fixed left-0 right-0 top-[57px] bg-white border-b border-gray-200 shadow-lg z-[101] max-h-[calc(100vh-57px)] overflow-y-auto">
              <div className="py-2">
                <Link
                  to="/drlist"
                  className={`block px-4 py-3 text-base font-medium transition-colors ${
                    location.pathname === '/' || isActive('/drlist')
                      ? 'text-blue-500 bg-blue-50'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  DR List
                </Link>

                <Link
                  to="/caldr"
                  className={`block px-4 py-3 text-base font-medium transition-colors ${
                    isActive('/caldr')
                      ? 'text-blue-500 bg-blue-50'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Calculation DR
                </Link>

                <Link
                  to="/suggestion"
                  className={`block px-4 py-3 text-base font-medium transition-colors ${
                    isActive('/suggestion')
                      ? 'text-blue-500 bg-blue-50'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Suggestion
                </Link>

                <Link
                  to="/calendar"
                  className={`block px-4 py-3 text-base font-medium transition-colors relative ${
                    isActive('/calendar')
                      ? 'text-blue-500 bg-blue-50'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    Calendar
                    {calendarNotifications > 0 && (
                      <span className="bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                        {calendarNotifications > 99 ? '99+' : calendarNotifications}
                      </span>
                    )}
                  </span>
                </Link>
              </div>
            </nav>
          </>
        )}
      </div>
    </header>
  );
};

export default Navbar;