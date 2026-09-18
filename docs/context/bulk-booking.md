# Bulk Booking Context

Use this for Bulk Upload, in-app Spreadsheet, product attachment, fee estimates,
and booking validation.

## Core Shape

Bulk Booking has two input methods feeding one flow:

1. Upload File.
2. Type in Spreadsheet.

Upload File remains the default. Type in Spreadsheet is a secondary path under
Bulk Upload, not a standalone module and not a sidebar item.

## Spreadsheet Rules

- Route stays under Bulk Upload.
- Page/service type is selected once per batch: Standard, Same-Day, or On-Demand
  when enabled for the scope.
- Do not reintroduce per-row service type, per-row payment, or notes columns.
- Location fields use the GGX-supported location cascade, not free-text-only.
- Add row sits at the bottom-left below the grid.
- Spreadsheet rows use shared validation as the user types.
- Mixed valid/invalid rows are separated; valid rows may proceed while invalid
  rows stay available for correction.

## Product Attachment

- Inventory-enabled scopes use a product picker in the Product/SKU cell.
- Attached products can include multiple products with per-product quantities.
- Quantity and declared value are derived from attached product snapshots.
- Product attachment is a draft aid; it does not reserve or deduct stock.
- Unknown, inactive, deleted, or over-stock products must flag validation errors.
- If Inventory is not enabled, Product/SKU remains free text.

## Fees

- Current spreadsheet/Bulk Upload fee displays are labeled estimates.
- Final fees are backend-owned.
- Item Protection shows as a conditional line item in the spreadsheet fee preview
  when any valid row has a declared value above ₱500 (formula:
  `max(declaredValue − 500, 0) × 1%`, frontend estimate only). The booking
  confirmation dialog rolls it into the estimated total; it is not broken out
  there.
- Location-based delivery rates and the authoritative BFF fee contract remain
  deferred until a richer fee estimate/finalization contract exists.
- Do not replace the estimate with partial backend math; the authoritative fee,
  validation, and service contract must ship together.

## Lifecycle Boundary

Upload row → validated / Ready to book → batch processed/booked → real
Transaction created.

- "Ready to book" rows on the Review Before Booking page are validated upload
  rows, NOT transactions. Never imply they were "created" or are "Awaiting
  payment" before the batch is actually booked. Do not deep-link them into the
  Transactions page — use the dedicated Ready Rows page
  (`/dashboard/bulk-uploader/ready/:id`, `BulkUploadReadyRows.tsx`) instead.
- A batch's rows become real Transactions only once its upload record status
  transitions to `awaiting-payment` (booked, payment still outstanding — cash
  on pick-up / billing) or `completed` (booked and paid — card / e-wallet /
  online banking). `transactionService.ts` synthesizes them on demand from the
  SAME live per-batch row state the Review page writes
  (`data/bulkUploads.ts`'s `BatchRowsState`/`getSpreadsheetBatchRows`) —
  never hand-duplicate this data into a second list.
- Completed Batch Details (`BulkUploadCompleted.tsx`) must read its
  transaction table from `transactionService.getTransactionBatchById()` (the
  same source the Transactions "By Batch" view uses), not a separate/
  fabricated row list.
- Bulk-upload detail pages (Review, Ready Rows, Completed) must call
  `bulkUploadService.canViewBulkUploadBatch()` before rendering a batch's
  data — a manager may only view their own subaccount's batches.

## Upload File Preservation

- Preserve existing Upload File behavior when changing spreadsheet booking.
- Uploaded-file validation retains template-specific coverage until real file
  parsing exists.
- Future adoption of `lib/bookingValidation` in the uploaded-file path must not
  remove COD cap, duplicate Reference ID, pouch size, or similar coverage.
