import { IconX, IconRoute, IconChevronRight, IconSparkles } from '@tabler/icons-react';
import { useJourney } from '../../contexts/JourneyContext';
import { groupJourneys } from '../../data/journeyRegistry';
import { cn } from '../../lib/utils';

/**
 * Journey Showcase chrome: floating "UX Journeys" CTA, the launch drawer, and
 * the active-journey indicator. Mounted once inside RootLayout so it only
 * ever appears within the authenticated dashboard shell. Purely additive —
 * renders nothing that affects normal page layout or behavior.
 */
export function JourneyShell() {
  const { journeys, isDrawerOpen, openDrawer, closeDrawer, activeJourney, enterJourney, exitJourney } = useJourney();
  const groups = groupJourneys(journeys);

  return (
    <>
      {/* Active journey indicator */}
      {activeJourney && (
        <div className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full bg-gray-900 text-white shadow-lg pl-3.5 pr-2 py-1.5 text-xs font-medium">
          <IconSparkles className="w-3.5 h-3.5 text-amber-300 flex-shrink-0" />
          <span className="whitespace-nowrap">
            UX Journey: <span className="font-semibold">{activeJourney.indicatorLabel}</span>
          </span>
          <span className="mx-0.5 text-gray-500">·</span>
          <button
            onClick={exitJourney}
            className="rounded-full px-2 py-0.5 text-amber-300 hover:bg-white/10 hover:text-amber-200 cursor-pointer transition-colors"
          >
            Exit
          </button>
        </div>
      )}

      {/* Floating CTA */}
      <button
        onClick={openDrawer}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-gray-900 text-white shadow-lg pl-4 pr-4.5 py-2.5 text-sm font-semibold hover:bg-gray-800 transition-colors cursor-pointer"
        aria-haspopup="dialog"
        aria-expanded={isDrawerOpen}
      >
        <IconRoute className="w-4 h-4 flex-shrink-0" />
        UX Journeys
      </button>

      {/* Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label="UX Journeys">
          <div className="absolute inset-0 bg-gray-900/40" onClick={closeDrawer} />
          <div className="relative w-full max-w-sm h-full bg-white shadow-xl flex flex-col animate-in slide-in-from-right">
            <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
                  <IconRoute className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">UX Journeys</h2>
                  <p className="text-xs text-gray-500">Proposed flows for stakeholder review — mocked data only.</p>
                </div>
              </div>
              <button className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer" onClick={closeDrawer} aria-label="Close">
                <IconX className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {groups.map((group) => (
                <div key={group.category}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{group.category}</p>
                  <div className="space-y-3">
                    {group.subgroups.map((sub) => (
                      <div key={sub.subcategory ?? '__root'}>
                        {sub.subcategory && (
                          <p className="text-xs font-medium text-gray-500 mb-1.5 pl-0.5">{sub.subcategory}</p>
                        )}
                        <div className="space-y-1.5">
                          {sub.journeys.map((journey) => {
                            const isActive = activeJourney?.id === journey.id;
                            return (
                              <button
                                key={journey.id}
                                onClick={() => enterJourney(journey.id)}
                                className={cn(
                                  'w-full text-left flex items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors cursor-pointer',
                                  isActive
                                    ? 'border-gray-900 bg-gray-50'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
                                )}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-gray-900 leading-snug">{journey.title}</p>
                                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">{journey.description}</p>
                                </div>
                                <IconChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {activeJourney && (
              <div className="p-5 border-t border-gray-100">
                <button
                  onClick={exitJourney}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors py-2"
                >
                  <IconX className="w-4 h-4" />
                  Exit UX Journey Mode
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
