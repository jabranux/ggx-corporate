import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { IconPlus, IconMessage, IconEye, IconCircleCheck, IconPlayerPause, IconProgress } from '@tabler/icons-react';
import { StatCard } from '../components/StatCard';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { ReportIssueDrawer } from '../components/ReportIssueDrawer';
// Tickets live in HeyQ. This page reads them through the ticketsService façade
// (over the heyqService adapter). Creating a ticket happens IN PLACE via the
// Report an Issue drawer (which posts to HeyQ's customer API) — no redirect to
// HeyQ. Replies, status, resolution and reopening remain HeyQ's.
import {
  getTicketsList,
  getRequesterIdentity,
  TICKET_STATUS_META,
  TICKET_PRIORITY_META,
  TICKET_STATUS_OPTIONS,
  type SupportTicket,
} from '../services/ticketsService';
import { SearchInput } from '../components/SearchInput';
import { formatTicketDate } from '../lib/utils';
import { computeUnread } from '../lib/ticketReadState';

// The customer realtime channel is ticket-scoped (a token binds ONE ticket), so
// the list can't hold a socket per ticket. It stays live the contract-sanctioned
// way: re-reading the SAME REST API on focus and on a short poll, which surfaces
// new tickets, latest-activity, status and preview changes.
const LIST_POLL_MS = 15_000;

export function SupportTickets() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  // The in-app Report an Issue drawer — opened by "Submit a Ticket". No preselected
  // transaction here (the user picks affected transactions inside the drawer).
  const [reportOpen, setReportOpen] = useState(false);

  // Ticket list loaded from HeyQ. Reloaded on focus AND on a short poll so agent
  // replies, new tickets and status changes surface without a manual refresh.
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [unread, setUnread] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState('');
  const reloadTickets = () => { getTicketsList().then(setTickets).catch(() => {}); };

  useEffect(() => { getRequesterIdentity().then((who) => { if (who) setScope(who.externalUserId); }); }, []);

  useEffect(() => { reloadTickets(); }, []);
  useEffect(() => {
    const onFocus = () => reloadTickets();
    window.addEventListener('focus', onFocus);
    const poll = window.setInterval(reloadTickets, LIST_POLL_MS);
    return () => { window.removeEventListener('focus', onFocus); window.clearInterval(poll); };
  }, []);

  // Recompute unread (and seed first-seen baselines) whenever the list changes.
  useEffect(() => { setUnread(computeUnread(scope, tickets)); }, [tickets, scope]);

  // Deep-link from notifications / dashboard: ?new=1 opens the report drawer.
  useEffect(() => {
    if (searchParams.get('new') === '1') setReportOpen(true);
  }, [searchParams]);

  /** Open the in-app Report an Issue drawer (no preselected transaction). */
  const handleSubmitTicket = () => setReportOpen(true);

  const summary = useMemo(() => {
    const count = (...s: SupportTicket['status'][]) =>
      tickets.filter((t) => s.includes(t.status)).length;
    return {
      open: count('new', 'open'),
      inProgress: count('in_progress'),
      onHold: count('on_hold'),
      resolved: count('resolved', 'closed'),
    };
  }, [tickets]);

  const issueTypes = useMemo(
    () => Array.from(new Set(tickets.map((t) => t.issueType))).sort(),
    [tickets],
  );

  const visibleTickets = tickets
    .filter((t) => {
      const q = searchQuery.trim().toLowerCase();
      const searchOk =
        q.length < 2 ||
        t.id.toLowerCase().includes(q) ||
        (t.reference?.toLowerCase().includes(q) ?? false) ||
        t.trackingNumbers.some((n) => n.toLowerCase().includes(q)) ||
        t.subject.toLowerCase().includes(q);
      const statusOk = statusFilter === 'all' || t.status === statusFilter;
      const typeOk = typeFilter === 'all' || t.issueType === typeFilter;
      return searchOk && statusOk && typeOk;
    })
    // Recent-activity first: the most recently updated ticket leads the list.
    .sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());

  const unreadCount = tickets.filter((t) => unread.has(t.id)).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900">Support Tickets</h1>
            {unreadCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                {unreadCount} new {unreadCount === 1 ? 'update' : 'updates'}
              </span>
            )}
          </div>
          <p className="text-gray-600 mt-1">Submit support tickets and track your requests</p>
        </div>
        <Button onClick={handleSubmitTicket}>
          <IconPlus className="w-4 h-4 mr-2" />
          Submit a Ticket
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Open Tickets" value={String(summary.open)}       sub="Awaiting response"   icon={IconMessage}     iconBg="bg-orange-50"  iconColor="text-orange-600" />
        <StatCard label="In Progress"  value={String(summary.inProgress)} sub="Being handled"       icon={IconProgress}    iconBg="bg-blue-50"    iconColor="text-blue-600" />
        <StatCard label="On Hold"      value={String(summary.onHold)}     sub="Temporarily blocked" icon={IconPlayerPause} iconBg="bg-yellow-50"  iconColor="text-yellow-600" />
        <StatCard label="Resolved"     value={String(summary.resolved)}   sub="Closed successfully" icon={IconCircleCheck} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex-1">
              <SearchInput
                placeholder="Search by ticket #, order, or subject..."
                value={searchQuery}
                onChange={setSearchQuery}
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All Statuses</option>
                {TICKET_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
              <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="all">All Types</option>
                {issueTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket #</TableHead>
                  <TableHead>Linked Order</TableHead>
                  <TableHead>Issue Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Support Team</TableHead>
                  <TableHead>Last Update</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleTickets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-400 text-sm">
                      {tickets.length === 0
                        ? 'No tickets yet. Submit a ticket to get help from our support team.'
                        : searchQuery.trim().length >= 2
                          ? 'No tickets match your search.'
                          : 'No tickets match the current filter.'}
                    </TableCell>
                  </TableRow>
                ) : visibleTickets.map((ticket) => {
                  const status = TICKET_STATUS_META[ticket.status];
                  const priority = TICKET_PRIORITY_META[ticket.priority];
                  const isUnread = unread.has(ticket.id);
                  return (
                    <TableRow
                      key={ticket.id}
                      className={`cursor-pointer ${isUnread ? 'bg-blue-50/40' : ''}`}
                      onClick={() => navigate(`/dashboard/support-tickets/${ticket.id}`)}
                    >
                      <TableCell className="font-medium text-blue-600 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isUnread ? 'bg-blue-600' : 'bg-transparent'}`}
                            title={isUnread ? 'New activity' : undefined}
                          />
                          {ticket.reference?.trim() || ticket.id}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{ticket.trackingNumber}</TableCell>
                      <TableCell>{ticket.issueType}</TableCell>
                      <TableCell>
                        <Badge variant={priority.variant}>{priority.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {/* Support-ticket status — distinct from delivery status. */}
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-gray-600">{ticket.supportTeam}</TableCell>
                      <TableCell className="text-gray-600 whitespace-nowrap">{formatTicketDate(ticket.lastUpdate)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="View this ticket"
                          onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/support-tickets/${ticket.id}`); }}
                        >
                          <IconEye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600">Showing {visibleTickets.length} of {tickets.length} tickets</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled>Previous</Button>
              <Button variant="outline" size="sm" disabled={visibleTickets.length === tickets.length}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* In-app report drawer — creates the ticket via HeyQ's customer API without
          leaving Business+. On success we refresh the list so the new ticket shows. */}
      <ReportIssueDrawer
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmitted={reloadTickets}
      />
    </div>
  );
}
