import { useRef, useEffect, useState, useCallback } from 'react';

interface Tab {
  id: string;
  label: string;
  badge?: number;
}

interface TabsNavProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

export function TabsNav({ tabs, activeTab, onChange }: TabsNavProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [sliderStyle, setSliderStyle] = useState<{ left: number; width: number }>({
    left: 0,
    width: 0,
  });

  const updateSlider = useCallback(() => {
    const activeIndex = tabs.findIndex((t) => t.id === activeTab);
    const el = tabRefs.current[activeIndex];
    if (el) {
      const parent = el.parentElement;
      if (parent) {
        const parentRect = parent.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        setSliderStyle({
          left: elRect.left - parentRect.left,
          width: elRect.width,
        });
      }
    }
  }, [tabs, activeTab]);

  useEffect(() => {
    updateSlider();
  }, [updateSlider]);

  return (
    <div className="relative border-b border-border-subtle" role="tablist">
      <div className="flex">
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={`relative px-4 py-3 text-tabs font-bold transition-colors duration-150 ${
                isActive ? 'text-secondary' : 'text-text-inactive'
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-real-estate px-1.5 text-xs text-white">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        className="absolute bottom-0 h-0.5 bg-real-estate transition-all duration-200"
        data-testid="tab-slider"
        style={{ left: sliderStyle.left, width: sliderStyle.width }}
      />
    </div>
  );
}
