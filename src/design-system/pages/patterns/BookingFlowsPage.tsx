import { Link } from 'react-router';
import { DSPage } from '../../layout/DSPage';
import { Section, Subsection, SpecTable } from '../../components/DocPrimitives';

export function BookingFlowsPage() {
  return (
    <DSPage title="Booking flows">
      <Section
        id="booking-flows"
        title="Booking flows"
        intro="GGX Business+ supports two booking entry points: Bulk Upload (CSV/spreadsheet) and the Bulk Spreadsheet inline editor. Both follow a multi-step review-then-confirm pattern."
      >
        <Subsection title="Entry points">
          <SpecTable
            columns={['Entry', 'Route', 'Primary component']}
            rows={[
              ['Bulk uploader (CSV)', '/dashboard/bulk-uploader', 'BulkUploader.tsx'],
              ['In-app spreadsheet', '/dashboard/bulk-uploader/spreadsheet', 'BulkSpreadsheet.tsx'],
              ['Upload summary / review', '/dashboard/bulk-uploader/summary/:id', 'BulkUploadSummary.tsx'],
              ['Completed batch (Transactions-owned)', '/dashboard/transactions/batches/:batchId', 'TransactionBatchDetails.tsx'],
            ]}
          />
        </Subsection>

        <Subsection title="Shared flow steps">
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
            <li><strong className="text-gray-800 dark:text-gray-200">Entry</strong> — User uploads a CSV or enters rows in the spreadsheet editor.</li>
            <li><strong className="text-gray-800 dark:text-gray-200">Validation</strong> — Rows are validated server-side; errors are surfaced inline per row.</li>
            <li><strong className="text-gray-800 dark:text-gray-200">Review</strong> — Summary view shows valid/invalid counts, total weight, estimated cost.</li>
            <li><strong className="text-gray-800 dark:text-gray-200">Payment</strong> — Sender selects payment method via <Link to="/design-system/patterns/payment-options" className="text-[#0088C9] hover:underline dark:text-blue-400">Payment Options</Link>.</li>
            <li><strong className="text-gray-800 dark:text-gray-200">Confirmation</strong> — Batch is submitted; user is shown a success state with batch ID.</li>
          </ol>
        </Subsection>
      </Section>

      <Section id="delivery-options" title="Buyer checkout booking">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          The buyer-facing checkout uses the{' '}
          <Link to="/design-system/ggx-components/checkout-delivery-options" className="text-[#0088C9] hover:underline dark:text-blue-400">
            Checkout Delivery Options
          </Link>{' '}
          component to let buyers choose between Standard, Same-day, and On-demand delivery.
          This is a separate flow from corporate bulk booking — it runs at <code className="font-mono text-xs">/buy/:productId</code> and <code className="font-mono text-xs">/checkout</code>.
        </p>
        <SpecTable
          columns={['Option', 'Availability', 'Notes']}
          rows={[
            ['Standard', 'Always', 'Default option; lowest cost'],
            ['Same-day', 'Service-area dependent', 'Shown only when available for the pickup address'],
            ['On-demand', 'Service-area dependent', 'Real-time booking; shows live price from backend'],
          ]}
        />
      </Section>

      <Section id="conventions" title="Design conventions">
        <Subsection title="Bulk-first language">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            GGX Business+ is a bulk-first product. All booking UI uses plural terminology ("deliveries", "batches",
            "rows") by default. Individual delivery language ("book a delivery") is for Basic / self-serve contexts only.
          </p>
        </Subsection>
        <Subsection title="Error surfaces">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Row-level errors appear inline in the review table. Batch-level errors (e.g., payment failure) use
            the{' '}
            <Link to="/design-system/components/alert" className="text-[#0088C9] hover:underline dark:text-blue-400">Alert</Link>{' '}
            component in <code className="font-mono text-xs">destructive</code> variant at the top of the page.
          </p>
        </Subsection>
      </Section>
    </DSPage>
  );
}
