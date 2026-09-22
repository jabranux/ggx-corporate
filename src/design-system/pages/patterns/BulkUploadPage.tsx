import { DSPage } from '../../layout/DSPage';
import { Section, Subsection, SpecTable, CodeBlock } from '../../components/DocPrimitives';

export function BulkUploadPage() {
  return (
    <DSPage title="Bulk upload">
      <Section
        id="bulk-upload"
        title="Bulk upload"
        intro="The primary data-entry pattern for GGX Business+. Senders upload a CSV or use the in-app spreadsheet to create multiple deliveries in one operation."
      >
        <Subsection title="Steps">
          <SpecTable
            columns={['Step', 'Screen', 'Key UI elements']}
            rows={[
              ['1 – File drop', 'BulkUploader (/dashboard/bulk-uploader)', 'Drag-and-drop zone, CSV template download, file type validation'],
              ['2 – Row editing', 'BulkSpreadsheet (/bulk-uploader/spreadsheet)', 'Inline editable grid, row errors highlighted in red'],
              ['3 – Summary review', 'BulkUploadSummary (/bulk-uploader/summary/:id)', 'Valid/invalid counts, Table of rows, payment method selection'],
              ['4 – Confirmation', 'Success dialog (in BulkUploadSummary) → "View batch"', 'Lightweight success state; hands off to the canonical TransactionBatchDetails page (/dashboard/transactions/batches/:batchId), Transactions-owned'],
            ]}
          />
        </Subsection>
      </Section>

      <Section id="validation" title="Validation model">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Validation is server-side. The UI receives row-level error objects and renders them inline.
          Client-side validation is limited to empty-field guards before submission.
        </p>
        <Subsection title="Error states">
          <SpecTable
            columns={['State', 'Display']}
            rows={[
              ['Row error (single field)', 'Red cell border + tooltip on hover'],
              ['Row error (multi-field)', 'Red row highlight + error summary below the row'],
              ['Batch-level error', 'Alert (destructive) at the top of the review page'],
              ['Upload format error', 'Alert (destructive) with the specific format issue'],
            ]}
          />
        </Subsection>
      </Section>

      <Section id="payment-step" title="Payment step">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          After reviewing valid rows, the sender selects a payment method. This renders the sender variant
          of the Payment Options pattern. See{' '}
          <a href="/design-system/patterns/payment-options" className="text-[#0088C9] hover:underline dark:text-blue-400">
            Payment options
          </a>{' '}
          for the full documentation.
        </p>
        <Subsection title="Billing eligibility">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            The "Bill to account" option is shown only when the account has an approved credit line.
            Eligibility is determined by the backend — the frontend receives a boolean flag and shows or hides
            the option. Never compute billing eligibility on the frontend.
          </p>
        </Subsection>
      </Section>
    </DSPage>
  );
}
