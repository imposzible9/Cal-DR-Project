import { useState, useEffect, useMemo } from "react";
import Joyride, { STATUS, EVENTS } from "react-joyride";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";

const Tooltip = ({ step, index, tooltipProps, skipProps, backProps, primaryProps, totalSteps, isMobile }) => {
    const isLastStep = index === totalSteps - 1;

    return (
        <div
            {...tooltipProps}
            className="max-w-[calc(100vw-32px)] sm:max-w-md w-[320px] sm:w-[400px] p-0 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-white/10 ring-1 ring-black/5"
        >
            <AnimatePresence mode="wait">
                <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="p-4 sm:p-6"
                >
                    <div className="p-0">
                        <div className="flex items-center justify-between mb-3 sm:mb-4">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] sm:text-xs font-bold shadow-lg shadow-blue-500/30">
                                    {index + 1}
                                </div>
                                <h4 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white leading-none">
                                    {step.title}
                                </h4>
                            </div>
                            <button
                                {...skipProps}
                                className="text-[10px] sm:text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                            >
                                Skip
                            </button>
                        </div>

                        <p className="text-gray-600 dark:text-gray-300 text-xs sm:text-sm leading-relaxed mb-4 sm:mb-6">
                            {step.content}
                        </p>

                        <div className="flex items-center justify-between gap-4 pt-1 sm:pt-2">
                            {/* Progress Dots */}
                            <div className="flex gap-1 sm:gap-1.5">
                                {Array.from({ length: totalSteps }).map((_, i) => (
                                    <div
                                        key={i}
                                        className={`h-1 sm:h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-4 sm:w-6 bg-blue-500' : 'w-1 sm:w-1.5 bg-gray-200 dark:bg-gray-700'}`}
                                    />
                                ))}
                            </div>

                            <div className="flex items-center gap-2">
                                {index > 0 && (
                                    <button
                                        {...backProps}
                                        className="px-3 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-all"
                                    >
                                        back
                                    </button>
                                )}
                                <button
                                    {...primaryProps}
                                    className="px-4 py-1.5 sm:px-6 sm:py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-[10px] sm:text-xs font-bold rounded-lg shadow-lg shadow-blue-500/25 transition-all transform active:scale-95 whitespace-nowrap"
                                >
                                    {step.title === "Global Theme Toggle" ? "Let's start" : "Next"}
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

const Tutorial = () => {
    const [run, setRun] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const navigate = useNavigate();
    const location = useLocation();

    const getPageKey = (path) => {
        if (path === "/") return "home";
        if (path === "/caldr") return "caldr";
        if (path === "/suggestion") return "suggestion";
        if (path === "/calendar") return "calendar";
        if (path === "/news") return "news";
        return "general";
    };

    const homeSteps = useMemo(() => [
        {
            target: "body",
            title: "Welcome to Cal-DR!",
            content: "Let's get to know the various features so you can access DR investment data like a professional.",
            placement: "center",
            disableBeacon: true,
            disableScrolling: true,
        },
        {
            target: isMobile ? "body" : "#tour-drlist-desktop",
            title: "DR List",
            content: "View the full list of Depositary Receipts (DR) available in the market, complete with real-time price data and Market Cap.",
            placement: isMobile ? "center" : "center",
            disableBeacon: true,
            disableScrolling: true,
        },
        {
            target: "#tour-country-dropdown",
            title: "Market Filtering",
            content: "Easily filter DRs by their home target market, such as US, Hong Kong, or Vietnam, to find the assets you're interested in.",
            placement: isMobile ? "bottom" : "bottom",
            disableBeacon: true,
            disableScrolling: true,
        },
        {
            target: "#tour-watchlist-btn",
            title: "Your Favorites",
            content: "Click the star icon to add DRs to your personal watchlist for quick access to their latest performance.",
            placement: isMobile ? "bottom" : "bottom",
            disableBeacon: true,
            disableScrolling: true,
        },
        {
            target: "#tour-drlist-search",
            title: "Quick Search",
            content: "Search for specific DR symbols or underlying company names to quickly find the assets you are looking for.",
            placement: isMobile ? "bottom" : "bottom",
            disableBeacon: true,
            disableScrolling: true,
        },
        {
            target: "#tour-customize-btn",
            title: "Personalize Your View",
            content: "Tailor the data columns to your needs. Toggle visibility for metrics like Market Cap, Dividend Yield, or Outstanding Shares.",
            placement: isMobile ? "bottom" : "bottom",
            disableBeacon: true,
            disableScrolling: true,
        },
        {
            target: isMobile ? "#tour-tabs-mobile-target" : "#tour-tabs-container",
            title: "Most Popular / High Sensitivity",
            content: "Switch between 'Most Popular' to see high-volume DRs or 'High Sensitivity' to find DRs that track underlying price movements most closely.",
            placement: isMobile ? "bottom" : "bottom",
            disableBeacon: true,
            disableScrolling: true,
        },
        {
            target: isMobile ? "#tour-first-dr-row-mobile" : "#tour-first-dr-row-desktop",
            title: "Detail View",
            content: "Click on any row to view detailed information about the DR, including its fundamentals.",
            placement: isMobile ? "bottom" : "bottom",
            disableBeacon: true,
            disableScrolling: true,
        }
    ], [isMobile]);

    const caldrSteps = useMemo(() => [
        {
            target: isMobile ? "body" : "#tour-caldr-desktop",
            title: "Calculation DR",
            content: "Calculate the indicative Fair Bid / Fair Ask prices for DRs based on underlying foreign stock prices and current exchange rates.",
            placement: isMobile ? "center" : "center",
            disableBeacon: true,
            disableScrolling: true,
        },
        {
            target: "#tour-cal-select-card",
            title: "Choose Your DR",
            content: "Start by selecting the DR you want to analyze. You can search by its symbol or the name of its underlying foreign asset to see its specific conversion ratio and last price.",
            placement: isMobile ? "bottom" : "right",
            disableBeacon: true,
            disableScrolling: true,
        },
        {
            target: "#tour-cal-input-card",
            title: "Inputs",
            content: "Adjust the underlying foreign stock price or exchange rate to simulate different market scenarios. Use the 'Clear' button to reset inputs.",
            placement: isMobile ? "bottom" : "left",
            disableBeacon: true,
            disableScrolling: isMobile ? false : true,
        },
        {
            target: "#tour-cal-result-card",
            title: "Calculation Results",
            content: "Instantly see the calculated Fair Bid and Fair Ask prices in THB, providing a baseline for your trading decisions.",
            placement: isMobile ? "bottom" : "left",
            disableBeacon: true,
            disableScrolling: true,
        },
        {
            target: "#tour-cal-table",
            title: "Trading Information",
            content: "Compare related DRs that track the same underlying asset. View their latest trading stats and basic DR information in one comprehensive table.",
            placement: isMobile ? "top" : "top",
            disableBeacon: true,
        }
    ], [isMobile]);

    const suggestionSteps = useMemo(() => [
        {
            target: isMobile ? "body" : "#tour-suggestion-desktop",
            title: "Suggestion",
            content: "Access Technical Ratings for underlying assets to help support your investment decision-making.",
            placement: isMobile ? "center" : "center",
            disableBeacon: true,
            disableScrolling: true,
        },
        {
            target: "#tour-sugg-timeframe",
            title: "Performance Horizons",
            content: "Toggle between 1-Day and 1-Week ratings to see technical signals across different timeframes.",
            placement: isMobile ? "bottom" : "bottom",
            disableBeacon: true,
            disableScrolling: true,
        },
        {
            target: "#tour-sugg-change-filter",
            title: "Latest Trends",
            content: "Filter for 'Latest Only' or see assets that have recently shifted their technical ratings (Positive or Negative).",
            placement: isMobile ? "bottom" : "bottom",
            disableBeacon: true,
            disableScrolling: true,
        },
        {
            target: "#tour-sugg-ratings-filter",
            title: "Signal Specifics",
            content: "Focus on specific signals like 'Strong Buy' or 'Sell' to find assets that match your trading strategy.",
            placement: isMobile ? "bottom" : "bottom",
            disableBeacon: true,
            disableScrolling: true,
        },
        {
            target: isMobile ? "#tour-sugg-first-row-mobile" : "#tour-sugg-first-row",
            title: "Deep Dive Signals",
            content: "Click on any asset to view its detailed rating history, accuracy win-rate, and historical signal performance.",
            placement: isMobile ? "bottom" : "bottom",
            disableBeacon: true,
            disableScrolling: true,
        }
    ], [isMobile]);

    const calendarSteps = useMemo(() => [
        {
            target: isMobile ? "body" : "#tour-calendar-desktop",
            title: "Earnings Calendar",
            content: "Track the earnings announcement dates of underlying stocks to stay ahead of potential price movements.",
            placement: isMobile ? "center" : "center",
            disableBeacon: true,
            disableScrolling: true,
        },
        {
            target: "#tour-calendar-days",
            title: "Weekly Outlook",
            content: "Filter earnings by day of the week to plan your trading strategy for the days ahead.",
            placement: isMobile ? "bottom" : "bottom",
            disableBeacon: true,
            disableScrolling: true,
        },
        {
            target: "#tour-calendar-actions",
            title: "Stay Updated",
            content: "Manually refresh data or mark all items as read to stay current with the latest earnings reports.",
            placement: isMobile ? "bottom" : "bottom",
            disableBeacon: true,
            disableScrolling: true,
        },
        {
            target: isMobile ? "#tour-calendar-first-row-mobile" : "#tour-calendar-first-row",
            title: "Earnings Details",
            content: "View EPS estimates, actuals, surprises, and revenue data for each company along with mapped DR information.",
            placement: isMobile ? "bottom" : "bottom",
            disableBeacon: true,
            disableScrolling: true,
        }
    ], [isMobile]);

    const newsSteps = useMemo(() => [
        {
            target: isMobile ? "body" : "#tour-news-desktop",
            title: "News",
            content: "Stay updated with critical news and global events that impact DR prices worldwide.",
            placement: isMobile ? "center" : "center",
            disableBeacon: true,
            disableScrolling: true,
        },
        {
            target: "#tour-news-top-stories",
            title: "Featured Top Stories",
            content: "Stay ahead with the most impactful market news and featured analysis for major underlying assets.",
            placement: isMobile ? "bottom" : "bottom",
            disableBeacon: true,
            disableScrolling: true,
        }
    ], [isMobile]);

    const themeSteps = useMemo(() => [
        {
            target: isMobile ? "#tour-theme-mobile" : "#tour-theme-desktop",
            title: "Global Theme Toggle",
            content: "Finally, switch between Light and Dark mode to suit your style at any time. You have now completed the introduction to all sections of Cal-DR. Happy investing!",
            placement: isMobile ? "bottom" : "bottom-end",
            disableBeacon: true,
            disableScrolling: true,
        }
    ], [isMobile]);

    const steps = useMemo(() => {
        const key = getPageKey(location.pathname);
        let baseSteps = [];
        if (key === "home") baseSteps = homeSteps;
        else if (key === "caldr") baseSteps = caldrSteps;
        else if (key === "suggestion") baseSteps = suggestionSteps;
        else if (key === "calendar") baseSteps = calendarSteps;
        else if (key === "news") baseSteps = newsSteps;

        if (baseSteps.length === 0) return [];

        // Check if all other required pages have been seen
        const REQUIRED_PAGES = ["home", "caldr", "suggestion", "calendar", "news"];
        const othersSeen = REQUIRED_PAGES
            .filter(p => p !== key)
            .every(p => localStorage.getItem(`has_seen_tutorial_${p}`) === "true");

        const themeSeen = localStorage.getItem("has_seen_tutorial_theme") === "true";

        // Append theme step if on News page and theme tutorial not yet seen
        if (key === "news" && !themeSeen) {
            return [...baseSteps, ...themeSteps];
        }

        // Optional: If all pages are seen but theme not yet, show only theme tour
        const allPagesSeen = REQUIRED_PAGES.every(p => localStorage.getItem(`has_seen_tutorial_${p}`) === "true");
        if (allPagesSeen && !themeSeen) {
            return themeSteps;
        }

        return baseSteps;
    }, [location.pathname, homeSteps, caldrSteps, suggestionSteps, calendarSteps, newsSteps, themeSteps]);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);

        const pageKey = getPageKey(location.pathname);
        let timer;

        if (pageKey && pageKey !== "general") {
            const hasSeenTutorial = localStorage.getItem(`has_seen_tutorial_${pageKey}`) === "true";
            const hasSeenTheme = localStorage.getItem("has_seen_tutorial_theme") === "true";
            const REQUIRED_PAGES = ["home", "caldr", "suggestion", "calendar", "news"];
            const allPagesSeen = REQUIRED_PAGES.every(p => localStorage.getItem(`has_seen_tutorial_${p}`) === "true");

            if (!hasSeenTutorial) {
                console.log(`Tutorial: Starting ${pageKey} tutorial...`);
                timer = setTimeout(() => {
                    setRun(true);
                    setStepIndex(0);
                }, 1000);
            } else if (!hasSeenTheme && allPagesSeen) {
                console.log(`Tutorial: All pages seen, starting Theme tutorial...`);
                timer = setTimeout(() => {
                    setRun(true);
                    setStepIndex(0);
                }, 1000);
            }
        }

        return () => {
            window.removeEventListener('resize', handleResize);
            if (timer) clearTimeout(timer);
        };
    }, [location.pathname]);

    // Prevent body scroll when tutorial is active (except on CalDR page)
    useEffect(() => {
        const pageKey = getPageKey(location.pathname);
        if (run && pageKey !== "caldr") {
            document.body.style.overflow = 'hidden';
            document.body.style.paddingRight = '0px';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [run, location.pathname]);

    const handleJoyrideCallback = (data) => {
        const { action, index, status, type } = data;

        const navigateToNextPage = (currentPageKey) => {
            const sequence = ["home", "caldr", "suggestion", "calendar", "news"];
            const currentIndex = sequence.indexOf(currentPageKey);
            if (currentIndex !== -1 && currentIndex < sequence.length - 1) {
                const nextPathMap = {
                    "home": "/caldr",
                    "caldr": "/suggestion",
                    "suggestion": "/calendar",
                    "calendar": "/news"
                };
                const nextPath = nextPathMap[currentPageKey];
                if (nextPath) {
                    console.log(`Tutorial: ${currentPageKey} finished, navigating to ${nextPath}...`);
                    navigate(nextPath);
                }
            }
        };

        if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
            setRun(false);
            const pageKey = getPageKey(location.pathname);
            if (pageKey) {
                const currentStep = steps[index];
                const isThemeStep = currentStep && currentStep.title === "Global Theme Toggle";

                if (isThemeStep || (index === steps.length - 1 && steps.some(s => s.title === "Global Theme Toggle"))) {
                    localStorage.setItem("has_seen_tutorial_theme", "true");
                    navigate("/"); // Navigate back to home page after theme tutorial
                }

                localStorage.setItem(`has_seen_tutorial_${pageKey}`, "true");

                // Auto-navigate to next page if tutorial finished successfully
                if (status === STATUS.FINISHED) {
                    navigateToNextPage(pageKey);
                }
            }
        } else if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
            const nextIndex = type === EVENTS.STEP_AFTER
                ? index + (action === 'prev' ? -1 : 1)
                : index;

            if (nextIndex >= 0 && nextIndex < steps.length) {
                setStepIndex(nextIndex);
            } else if (type === EVENTS.STEP_AFTER && nextIndex >= steps.length) {
                setRun(false);
                const pageKey = getPageKey(location.pathname);
                if (pageKey) {
                    const lastStep = steps[steps.length - 1];
                    if (lastStep && lastStep.title === "Global Theme Toggle") {
                        localStorage.setItem("has_seen_tutorial_theme", "true");
                        navigate("/"); // Navigate back to home page
                    }
                    localStorage.setItem(`has_seen_tutorial_${pageKey}`, "true");

                    // Auto-navigate to next page if tutorial finished successfully
                    navigateToNextPage(pageKey);
                }
            }
        }
    };

    return (
        <Joyride
            steps={steps}
            run={run}
            stepIndex={stepIndex}
            continuous
            scrollToFirstStep={false}
            disableScrolling={false}
            scrollOffset={isMobile ? 100 : 20}
            showProgress={false}
            showSkipButton
            tooltipComponent={(props) => <Tooltip {...props} totalSteps={steps.length} isMobile={isMobile} />}
            callback={handleJoyrideCallback}
            styles={{
                options: {
                    zIndex: 20000,
                    arrowColor: "#2F80ED",
                    overlayColor: "rgba(0, 0, 0, 0.4)",
                    backgroundColor: "transparent",
                    beaconSize: isMobile ? 0 : 36,
                },
                overlay: {
                    backgroundColor: "rgba(0, 0, 0, 0.4)",
                    pointerEvents: 'auto',
                },
                spotlight: {
                    borderRadius: 12,
                    boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.4), 0 0 15px 5px rgba(47, 128, 237, 0.2)",
                },
                tooltip: isMobile ? {
                    position: 'fixed',
                    top: '50% !important',
                    left: '50% !important',
                    transform: 'translate(-50%, -50%) !important',
                    margin: 0,
                } : {}
            }}
            floaterProps={{
                disableAnimation: false,
                disableFlip: true,
                offset: 15,
            }}
        />
    );
};

export default Tutorial;
