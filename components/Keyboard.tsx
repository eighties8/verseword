import React from 'react';
import { AArrowDown, Delete } from 'lucide-react';

interface Props {
  onKeyPress: (key: string) => void;
  onEnter: () => void;
  onBackspace: () => void;
  letterStates: Record<string, 'correct' | 'present' | 'absent'>;
  revealedLetters?: Set<string>;
}

export default function Keyboard({
  onKeyPress,
  onEnter,
  onBackspace,
  letterStates,
  revealedLetters,
}: Props) {
  const rows: string[][] = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'BACKSPACE'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'ENTER'],
  ];

  const getKeyColor = (key: string) => {
    if (key === 'ENTER' || key === 'BACKSPACE')
      return 'bg-gray-600 hover:bg-gray-500 active:bg-gray-700 !text-white';
    const state = letterStates[key];
    switch (state) {
      case 'correct':
        return 'bg-green-600 hover:bg-green-600 active:bg-green-700 !text-white';
      case 'present':
        return 'bg-yellow-500 hover:bg-amber-600 active:bg-amber-700 !text-white';
      case 'absent':
        return 'bg-gray-300 hover:bg-gray-400 active:bg-gray-500 !text-gray-500';
      default:
        return 'bg-gray-600 hover:bg-gray-500 active:bg-gray-700 !text-white';
    }
  };

  // Mobile (default): 10-col grid; md+: flex like you had before
  const getRowClasses = () =>
    'w-full max-w-[520px] grid grid-cols-10 gap-0.5 md:gap-1 md:flex md:justify-center';

  // Wrapper around each button:
  // - Mobile: it's the grid cell. We give ENTER col-span-3 on the last row, else col-span-1.
  // - md+: we revert to your flex min widths and ENTER grows.
  const getWrapperClasses = (key: string, rowIndex: number) => {
    const base = ['relative'];

    // MOBILE (grid)
    if (key === 'ENTER' && rowIndex === 2) {
      base.push('col-span-3'); // take remaining space on bottom row (7 letters + 3 = 10)
    } else {
      base.push('col-span-1'); // one column per key
    }

    // DESKTOP/TABLET (md+ fallback to flex widths)
    if (key === 'ENTER') {
      base.push('md:flex md:flex-1 md:basis-0'); // grow on md+
    } else if (key === 'BACKSPACE') {
      base.push('md:flex md:min-w-[64px]'); // wider on md+
    } else {
      base.push('md:flex md:min-w-[48px]'); // standard letter min-width on md+
    }

    return base.join(' ');
  };

  const getButtonClasses = (key: string) =>
    [
      'w-full', // fill the grid cell / flex wrapper
      'px-1.5 py-4 md:px-3 md:py-4 rounded font-semibold transition-colors touch-manipulation',
      'text-center flex items-center justify-center',
      'h-12 md:h-12 lg:h-14',
      getKeyColor(key),
    ].join(' ');

  const getKeyContent = (key: string) => {
    if (key === 'BACKSPACE') return <Delete className="w-5 h-5" />;
    if (key === 'ENTER') return 'ENTER';
    return letterStates[key] === 'absent' ? (
      <span className="line-through-custom">{key}</span>
    ) : (
      key
    );
  };

  const handleKeyClick = (key: string) => {
    if (key === 'ENTER') onEnter();
    else if (key === 'BACKSPACE') onBackspace();
    else onKeyPress(key);
  };

  return (
    <div className="mt-8 md:mt-10 space-y-2 select-none">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className={getRowClasses()}>
          {row.map((key) => (
            <div key={key} className={getWrapperClasses(key, rowIndex)}>
              <button
                type="button"
                onClick={() => handleKeyClick(key)}
                onTouchStart={() => {}}
                className={getButtonClasses(key)}
              >
                {getKeyContent(key)}
              </button>

              {revealedLetters?.has(key) && (
                <div className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 transform bg-green-600 rounded-full p-0.5">
                  <AArrowDown className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}