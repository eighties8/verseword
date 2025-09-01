import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { getESTDateString } from "../lib/timezone";

export default function ArchivePage() {
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    // Initialize with today's date in EST timezone
    const todayEST = getESTDateString();
    return new Date(todayEST + 'T00:00:00');
  });
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    // Initialize with current month in EST timezone
    const todayEST = getESTDateString();
    const today = new Date(todayEST + 'T00:00:00');
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [isClient, setIsClient] = useState(false);
  
  // Cache for puzzle completion status by month
  const [puzzleCache, setPuzzleCache] = useState<Map<string, Set<string>>>(new Map());

  // Start date: August 25, 2025 (when daily puzzles actually began)
  const START_DATE = new Date(2025, 7, 25); // Month is 0-indexed, so 7 = August

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const years = Array.from({ length: 10 }, (_, i) => 2025 + i);

  // Set client flag to prevent hydration mismatch
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Get month key for caching (YYYY-MM format)
  const getMonthKey = useCallback((date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // Optimized: Load puzzle completion data for a specific month
  const loadMonthPuzzleData = useCallback((month: Date) => {
    const monthKey = getMonthKey(month);
    
    // Check if we already have this month cached
    if (puzzleCache.has(monthKey)) {
      return;
    }

    try {
      const completedDates = new Set<string>();
      
      // Check the new puzzle storage system first
      const puzzles = localStorage.getItem('verseword:puzzles:v2');
      if (puzzles) {
        const puzzlesData = JSON.parse(puzzles);
        
        // Find all completed puzzles for this month
        Object.values(puzzlesData).forEach((puzzle: any) => {
          if (puzzle.dateISO && puzzle.gameStatus === 'won') {
            const puzzleDate = new Date(puzzle.dateISO);
            if (puzzleDate.getFullYear() === month.getFullYear() && 
                puzzleDate.getMonth() === month.getMonth()) {
              completedDates.add(puzzle.dateISO);
            }
          }
        });
      }
      
      // Fallback to old stats system for backward compatibility
      const stats = localStorage.getItem('verseword:stats:v1');
      if (stats) {
        const statsData = JSON.parse(stats);
        if (statsData.results) {
          statsData.results.forEach((result: any) => {
            if (result.dateISO) {
              const resultDate = new Date(result.dateISO);
              if (resultDate.getFullYear() === month.getFullYear() && 
                  resultDate.getMonth() === month.getMonth()) {
                completedDates.add(result.dateISO);
              }
            }
          });
        }
      }
      
      // Cache the results for this month
      setPuzzleCache(prev => new Map(prev).set(monthKey, completedDates));
    } catch (error) {
      console.error('Error loading month puzzle data:', error);
      // Cache empty set on error
      setPuzzleCache(prev => new Map(prev).set(monthKey, new Set()));
    }
  }, [puzzleCache, getMonthKey]);

  // Load puzzle data when month changes
  useEffect(() => {
    if (isClient) {
      loadMonthPuzzleData(currentMonth);
    }
  }, [currentMonth, isClient, loadMonthPuzzleData]);

  const isDateSelectable = (date: Date) => {
    // Use EST timezone for today's date comparison
    const todayEST = getESTDateString();
    const dateEST = getESTDateString(date);
    const startDateEST = getESTDateString(START_DATE);
    return dateEST >= startDateEST && dateEST <= todayEST;
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const firstDayOfWeek = firstDay.getDay();
    
    return { firstDayOfWeek, daysInMonth };
  };

  const formatDateKey = (date: Date) => {
    return date.toISOString().slice(0, 10);
  };

  const hasPlayedPuzzle = (date: Date) => {
    const monthKey = getMonthKey(date);
    const dateString = formatDateKey(date);
    
    // Check cache first
    const monthData = puzzleCache.get(monthKey);
    if (monthData) {
      return monthData.has(dateString);
    }
    
    // If not cached, fallback to old method
    try {
      // Check the new puzzle storage system first
      const puzzles = localStorage.getItem('verseword:puzzles:v2');
      if (puzzles) {
        const puzzlesData = JSON.parse(puzzles);
        
        // Check if any puzzles exist for this date (any word length)
        return Object.values(puzzlesData).some((puzzle: any) => 
          puzzle.dateISO === dateString && puzzle.gameStatus === 'won'
        );
      }
      
      // Fallback to old stats system for backward compatibility
      const stats = localStorage.getItem('verseword:stats:v1');
      if (!stats) return false;
      
      const statsData = JSON.parse(stats);
      
      // Check if any results exist for this date
      return statsData.results && statsData.results.some((result: any) => 
        result.dateISO === dateString
      );
    } catch (error) {
      return false;
    }
  };

  const handleDateSelect = (date: Date) => {
    if (!isDateSelectable(date)) return;
    setSelectedDate(date);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      if (direction === 'prev') {
        newMonth.setMonth(newMonth.getMonth() - 1);
        // Ensure we don't go before August 2025
        if (newMonth < START_DATE) {
          newMonth.setFullYear(2025);
          newMonth.setMonth(7); // August
        }
      } else {
        newMonth.setMonth(newMonth.getMonth() + 1);
      }
      
      return newMonth;
    });
  };

  const generateCalendarDays = (month: Date) => {
    const { firstDayOfWeek, daysInMonth } = getDaysInMonth(month);
    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(month.getFullYear(), month.getMonth(), day);
      days.push(date);
    }
    
    return days;
  };

  if (!isClient) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto pt-4">
      <h1 className="text-2xl text-center mb-8">
        Play puzzles since August 25, 2025
      </h1>

      {/* Calendar Navigation */}
      <div className="flex items-center justify-center gap-4 mb-8">
        {/* Prev button */}
        <button
          onClick={() => navigateMonth('prev')}
          disabled={currentMonth <= START_DATE}
          className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center pr-2"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Month + Year Selects */}
        <div className="flex items-center gap-2">
          {/* Month Select */}
          <div className="relative inline-block">
            <select
              value={currentMonth.getMonth()}
              onChange={(e) =>
                setCurrentMonth((prev) => {
                  const newMonth = new Date(prev);
                  newMonth.setMonth(parseInt(e.target.value));
                  // Ensure we don't go before August 2025
                  if (newMonth < START_DATE) {
                    newMonth.setFullYear(2025);
                    newMonth.setMonth(7); // August
                  }
                  return newMonth;
                })
              }
              className="appearance-none pl-8 pr-3 py-2 border border-gray-300 rounded-lg bg-white focus:border-gray-500 focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 focus:outline-none"
            >
              {months.map((month, index) => {
                // Only show months from August 2025 onwards
                if (currentMonth.getFullYear() === 2025 && index < 7) return null;
                return (
                  <option key={`month-${index}`} value={index}>
                    {month}
                  </option>
                );
              })}
            </select>
            <ChevronDown className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>

          {/* Year Select */}
          <div className="relative inline-block">
            <select
              value={currentMonth.getFullYear()}
              onChange={(e) =>
                setCurrentMonth((prev) => {
                  const newMonth = new Date(prev);
                  newMonth.setFullYear(parseInt(e.target.value));
                  // Ensure we don't go before August 2025
                  if (newMonth < START_DATE) {
                    newMonth.setFullYear(2025);
                    newMonth.setMonth(7); // August
                  }
                  return newMonth;
                })
              }
              className="appearance-none pl-8 pr-3 py-2 border border-gray-300 rounded-lg bg-white focus:border-gray-500 focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 focus:outline-none"
            >
              {years.map((year) => {
                // Only show years from 2025 onwards
                if (year < 2025) return null;
                return (
                  <option key={`year-${year}`} value={year}>
                    {year}
                  </option>
                );
              })}
            </select>
            <ChevronDown className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
        </div>

        {/* Next button */}
        <button
          onClick={() => navigateMonth('next')}
          disabled={
            currentMonth.getMonth() === new Date().getMonth() &&
            currentMonth.getFullYear() === new Date().getFullYear()
          }
          className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center pr-2"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="max-w-md mx-auto mb-8">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
            <div key={`day-label-${index}`} className="w-10 h-10 flex items-center justify-center text-sm font-medium text-gray-500">
              {day}
            </div>
          ))}
        </div>
        {/* Horizontal line under the days row */}
        <div className="border-b border-gray-300 mb-2"></div>
        
        <div className="grid grid-cols-7 gap-1">
          {generateCalendarDays(currentMonth).map((day, index) => (
            <button
              key={`${currentMonth.getFullYear()}-${currentMonth.getMonth()}-${day?.getDate() || index}`}
              onClick={() => day && handleDateSelect(day)}
              disabled={!day || !isDateSelectable(day)}
              className={`
                w-10 h-10 rounded-lg text-base font-medium transition-colors relative
                ${day && isDateSelectable(day) 
                  ? 'hover:bg-gray-200 cursor-pointer' 
                  : 'text-gray-300 cursor-not-allowed'
                }
                ${day && selectedDate && formatDateKey(day) === formatDateKey(selectedDate) 
                  ? 'bg-green-600 text-white hover:bg-green-600' 
                  : 'text-gray-800'
                }
                ${day && formatDateKey(day) === getESTDateString() && !selectedDate 
                  ? 'ring-2 ring-green-300' 
                  : ''
                }
              `}
            >
              {/* Puzzle status indicator box above date - only show for selectable dates after 8/25/2025 */}
              {day && isDateSelectable(day) && (
                <>
                  {isClient ? (
                    <div className={`
                      absolute -top-1 left-1/2 transform -translate-x-1/2
                      w-3 h-3 rounded-sm
                      ${hasPlayedPuzzle(day) ? 'bg-green-600' : 'bg-gray-300'}
                    `} />
                  ) : (
                    <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-3 h-3 rounded-sm bg-gray-200 animate-pulse" />
                  )}
                </>
              )}
              {day?.getDate()}
            </button>
          ))}
        </div>
      </div>

      {/* Verseword Puzzle Selection */}
      {selectedDate && isDateSelectable(selectedDate) && (
        <div className="text-center">
          <Link
            href={`/?date=${formatDateKey(selectedDate)}&archive=true`}
            className="inline-block px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            Verseword #{(() => {
              // Calculate puzzle number (starting from 8/25/25 as puzzle #1)
              const startDate = new Date('2025-08-25');
              const daysDiff = Math.floor((selectedDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
              return daysDiff + 1;
            })()}
          </Link>
        </div>
      )}
    </div>
  );
}

ArchivePage.title = "Archive";  // header shows "Verseword · Archive"
ArchivePage.narrow = true;      // archive uses narrower container
