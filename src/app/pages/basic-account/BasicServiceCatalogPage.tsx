import { useNavigate } from 'react-router';
import { PageHeader } from '../../components/ui/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { groupCatalogByCategory, resolveServiceBadge, resolveServiceHref, SERVICE_BADGE_CLASS } from '../../lib/basicServiceCatalog';

/**
 * "View all" — the complete Basic feature catalog (spec §3), unaffected by
 * KYC answers: every service stays reachable here regardless of profiling
 * state or home-page recommendation ranking.
 */
export function BasicServiceCatalogPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const accountId = user?.accountId ?? 'basic-guest';
  const groups = groupCatalogByCategory();

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="All services" subtitle="Everything available on your GGX Basic account." />
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.category}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2.5">{group.category}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {group.items.map((item) => {
                const Icon = item.icon;
                const badge = resolveServiceBadge(item, accountId);
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(resolveServiceHref(item, accountId))}
                    className="relative flex flex-col items-start gap-2 rounded-xl border border-gray-200 bg-white p-4 text-left hover:border-gray-300 hover:shadow-sm transition-colors cursor-pointer"
                  >
                    {badge && (
                      <span className={`absolute top-3 right-3 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${SERVICE_BADGE_CLASS[badge.tone]}`}>
                        {badge.label}
                      </span>
                    )}
                    <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                      <Icon className="w-4.5 h-4.5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-snug">{item.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
