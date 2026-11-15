/**
 * Service advisories / announcements for the Basic home (spec §4). Structured
 * mock content for now — `severity: 'critical'` renders as a prominent alert,
 * everything else as a compact, low-intrusion row. Swappable later for a real
 * announcements/advisories API without touching
 * `components/basic-account/BasicAnnouncements.tsx`.
 */
export type AnnouncementSeverity = 'critical' | 'normal';
export type AnnouncementKind = 'advisory' | 'update' | 'holiday' | 'feature';

export interface BasicAnnouncement {
  id: string;
  kind: AnnouncementKind;
  severity: AnnouncementSeverity;
  title: string;
  body: string;
  date: string;
}

export const ANNOUNCEMENTS: BasicAnnouncement[] = [
  {
    id: 'weather-advisory',
    kind: 'advisory',
    severity: 'critical',
    title: 'Delivery delays expected in Metro Manila',
    body: 'Heavy rain is affecting pickup and delivery times in some areas. Riders are prioritizing safety — expect delays of up to a day.',
    date: '2026-11-15',
  },
  {
    id: 'holiday-schedule',
    kind: 'holiday',
    severity: 'normal',
    title: 'Bonifacio Day schedule',
    body: 'Limited rider availability on November 30. Book early to avoid delays.',
    date: '2026-11-20',
  },
  {
    id: 'sulit-bundles-launch',
    kind: 'feature',
    severity: 'normal',
    title: 'Sulit Bundles is now available',
    body: 'Prepay for a bundle of deliveries and save on every booking.',
    date: '2026-11-10',
  },
  {
    id: 'app-update',
    kind: 'update',
    severity: 'normal',
    title: 'Faster booking, fewer taps',
    body: "We've streamlined the single-delivery booking flow based on seller feedback.",
    date: '2026-11-05',
  },
];

export function getCriticalAnnouncements(): BasicAnnouncement[] {
  return ANNOUNCEMENTS.filter((a) => a.severity === 'critical');
}

export function getRegularAnnouncements(): BasicAnnouncement[] {
  return ANNOUNCEMENTS.filter((a) => a.severity === 'normal');
}
