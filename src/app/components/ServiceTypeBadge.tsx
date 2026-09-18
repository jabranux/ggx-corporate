import { Badge } from './ui/Badge';
import { SERVICE_TYPE_SHORT_LABEL, type DeliveryServiceType } from '../services/transactionService';

// Badge colors align with the Bulk Upload service types — Standard = blue,
// Same-Day = orange, On-Demand = purple — using subtle -100/-800 tones
// consistent with the other transaction badges. Shared by the Transactions
// list and the Completed Batch Details page so a service type reads
// identically everywhere it appears.
const SERVICE_TYPE_BADGE: Record<DeliveryServiceType, { className: string; label: string }> = {
  standard:  { className: 'bg-blue-100 text-blue-800',     label: SERVICE_TYPE_SHORT_LABEL.standard },
  same_day:  { className: 'bg-orange-100 text-orange-800', label: SERVICE_TYPE_SHORT_LABEL.same_day },
  on_demand: { className: 'bg-violet-100 text-violet-800', label: SERVICE_TYPE_SHORT_LABEL.on_demand },
};

/** Service-type cell: a single badge — exactly one service type per booking. */
export function ServiceTypeBadge({ serviceType }: { serviceType: DeliveryServiceType }) {
  const badge = SERVICE_TYPE_BADGE[serviceType];
  return <Badge className={badge.className}>{badge.label}</Badge>;
}
