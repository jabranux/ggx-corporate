/**
 * Pure-logic tests for the GGX Basic single-booking flow's new lib/service
 * layer: fee calculation (shared item-protection formula + Basic pouch
 * sizes), the mock booking-voucher service, the mock serviceability
 * service, and the independence of feePayer/senderPaymentMethod/
 * merchandiseCod/declaredValue from each other.
 *
 * These are plain TypeScript modules with no DOM/React dependency, so (like
 * `api-support-categories.test.mjs`'s handler tests) they're bundled with
 * esbuild into a temp CJS file and imported directly — no dev server/
 * Playwright needed for this kind of unit coverage.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import esbuild from 'esbuild';

const ROOT = path.resolve(import.meta.dirname, '..');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ggx-basic-booking-test-'));

let bookingFees;
let pouchSizes;
let voucherService;
let serviceability;
let pickupScheduling;
let checkoutEstimates;
let itemProtection;

before(async () => {
  const [feesOut, pouchOut, voucherOut, serviceabilityOut, schedulingOut, estimatesOut, protectionOut] = await Promise.all([
    esbuild.build({ entryPoints: [`${ROOT}/src/app/lib/bookingFees.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/src/app/lib/basicPouchSizes.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/src/app/services/bookingVoucherService.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/src/app/services/serviceabilityService.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/src/app/lib/basicPickupScheduling.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/src/app/lib/checkoutEstimates.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
    esbuild.build({ entryPoints: [`${ROOT}/src/app/lib/basicItemProtection.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }),
  ]);

  const feesFile = path.join(TMP_DIR, 'bookingFees.cjs');
  const pouchFile = path.join(TMP_DIR, 'basicPouchSizes.cjs');
  const voucherFile = path.join(TMP_DIR, 'bookingVoucherService.cjs');
  const serviceabilityFile = path.join(TMP_DIR, 'serviceabilityService.cjs');
  const schedulingFile = path.join(TMP_DIR, 'basicPickupScheduling.cjs');
  const estimatesFile = path.join(TMP_DIR, 'checkoutEstimates.cjs');
  const protectionFile = path.join(TMP_DIR, 'basicItemProtection.cjs');
  fs.writeFileSync(feesFile, feesOut.outputFiles[0].text);
  fs.writeFileSync(pouchFile, pouchOut.outputFiles[0].text);
  fs.writeFileSync(voucherFile, voucherOut.outputFiles[0].text);
  fs.writeFileSync(serviceabilityFile, serviceabilityOut.outputFiles[0].text);
  fs.writeFileSync(schedulingFile, schedulingOut.outputFiles[0].text);
  fs.writeFileSync(estimatesFile, estimatesOut.outputFiles[0].text);
  fs.writeFileSync(protectionFile, protectionOut.outputFiles[0].text);

  bookingFees = await import(`file://${feesFile.replace(/\\/g, '/')}`);
  pouchSizes = await import(`file://${pouchFile.replace(/\\/g, '/')}`);
  voucherService = await import(`file://${voucherFile.replace(/\\/g, '/')}`);
  serviceability = await import(`file://${serviceabilityFile.replace(/\\/g, '/')}`);
  pickupScheduling = await import(`file://${schedulingFile.replace(/\\/g, '/')}`);
  checkoutEstimates = await import(`file://${estimatesFile.replace(/\\/g, '/')}`);
  itemProtection = await import(`file://${protectionFile.replace(/\\/g, '/')}`);
});

after(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('computeItemProtectionFee — shared formula', () => {
  it('matches the documented estimate: max(declaredValue - 500, 0) * 1%', () => {
    assert.equal(bookingFees.computeItemProtectionFee(0), 0);
    assert.equal(bookingFees.computeItemProtectionFee(500), 0);
    assert.equal(bookingFees.computeItemProtectionFee(1500), 10);
    assert.equal(bookingFees.computeItemProtectionFee(10500), 100);
  });
});

describe('estimateBasicBookingFee — GGX Basic pouch sizes', () => {
  it('uses the Basic pouch-size reference prices, not the Business+ bulk SIZE_FEE table', () => {
    const small = bookingFees.estimateBasicBookingFee({ pouchSize: 'small', serviceType: 'standard', coveredValue: 0, protectionTier: 'free' });
    assert.equal(small.baseFee, 80);

    const medium = bookingFees.estimateBasicBookingFee({ pouchSize: 'medium', serviceType: 'standard', coveredValue: 0, protectionTier: 'free' });
    // Documented mismatch: Basic medium is ₱100, Business+ bulk MEDIUM is ₱120.
    assert.equal(medium.baseFee, 100);

    const large = bookingFees.estimateBasicBookingFee({ pouchSize: 'large', serviceType: 'standard', coveredValue: 0, protectionTier: 'free' });
    // Documented mismatch: Basic large is ₱130, Business+ bulk LARGE is ₱180.
    assert.equal(large.baseFee, 130);
  });

  it('BASIC_POUCH_FEE mirrors basicPouchSizes.ts\'s reference prices exactly', () => {
    for (const size of pouchSizes.BASIC_POUCH_SIZES) {
      assert.equal(bookingFees.BASIC_POUCH_FEE[size.key], size.price);
    }
  });

  it('applies the service-type surcharge on top of the pouch base fee', () => {
    const sameDay = bookingFees.estimateBasicBookingFee({ pouchSize: 'small', serviceType: 'same_day', coveredValue: 0, protectionTier: 'free' });
    assert.equal(sameDay.serviceSurcharge, 70);
    assert.equal(sameDay.total, 80 + 70);
  });

  it('item protection fee only applies when protectionTier is "paid", computed from coveredValue alone', () => {
    const paid = bookingFees.estimateBasicBookingFee({ pouchSize: 'small', serviceType: 'standard', coveredValue: 1500, protectionTier: 'paid' });
    assert.equal(paid.itemProtection, 10);

    // Same coveredValue, Free tier explicitly chosen — no fee, even though
    // the value itself would otherwise price out above ₱500.
    const free = bookingFees.estimateBasicBookingFee({ pouchSize: 'small', serviceType: 'standard', coveredValue: 1500, protectionTier: 'free' });
    assert.equal(free.itemProtection, 0);
  });

  it('falls back to the small pouch fee for an unrecognized size key', () => {
    const fallback = bookingFees.estimateBasicBookingFee({ pouchSize: 'not-a-real-size', serviceType: 'standard', coveredValue: 0, protectionTier: 'free' });
    assert.equal(fallback.baseFee, 80);
  });

  it('every pouch size carries an official GGX parcel icon URL matching BASIC_POUCH_ICON_FILENAME', () => {
    for (const size of pouchSizes.BASIC_POUCH_SIZES) {
      const expectedFilename = pouchSizes.BASIC_POUCH_ICON_FILENAME[size.key];
      assert.ok(expectedFilename, `${size.key} must have an icon filename mapping`);
      assert.equal(size.iconUrl, `https://www.gogoxpress.com/wp-content/themes/ggx/img/${expectedFilename}`);
    }
  });

  it('every size has its own distinct official GGX parcel illustration, including Box vs Oversized', () => {
    assert.equal(pouchSizes.BASIC_POUCH_ICON_FILENAME.small, 'parcel-small.svg');
    assert.equal(pouchSizes.BASIC_POUCH_ICON_FILENAME.medium, 'parcel-medium.svg');
    assert.equal(pouchSizes.BASIC_POUCH_ICON_FILENAME.large, 'parcel-large.svg');
    assert.equal(pouchSizes.BASIC_POUCH_ICON_FILENAME.xl, 'parcel-box.svg');
    assert.equal(pouchSizes.BASIC_POUCH_ICON_FILENAME.xxl, 'parcel-oversized.svg');
  });

  it('xl/xxl are relabeled Box/Oversized with corrected dimensions and weight limits, keeping their internal keys', () => {
    const box = pouchSizes.getBasicPouchSize('xl');
    assert.equal(box.label, 'Box');
    assert.equal(box.dims, '46 × 30 × 23 cm');
    assert.equal(box.maxWeight, '6 kg');

    const oversized = pouchSizes.getBasicPouchSize('xxl');
    assert.equal(oversized.label, 'Oversized');
    assert.equal(oversized.dims, '40 × 40 × 40 cm limit');
    assert.equal(oversized.maxWeight, '20 kg');
  });
});

describe('getProtectionCoveredValue — COD amount vs declared value, mutually exclusive', () => {
  it('uses the declared value when COD is disabled', () => {
    const value = itemProtection.getProtectionCoveredValue({
      merchandiseCod: { enabled: false, amount: '9999' },
      declaredValue: '1500',
    });
    assert.equal(value, 1500);
  });

  it('uses the COD amount when COD is enabled, ignoring declaredValue entirely', () => {
    const value = itemProtection.getProtectionCoveredValue({
      merchandiseCod: { enabled: true, amount: '1000' },
      declaredValue: '9999',
    });
    assert.equal(value, 1000);
  });

  it('treats empty/non-numeric/negative input as 0 rather than throwing or going negative', () => {
    assert.equal(itemProtection.getProtectionCoveredValue({ merchandiseCod: { enabled: false, amount: '' }, declaredValue: '' }), 0);
    assert.equal(itemProtection.getProtectionCoveredValue({ merchandiseCod: { enabled: false, amount: '' }, declaredValue: 'not-a-number' }), 0);
    assert.equal(itemProtection.getProtectionCoveredValue({ merchandiseCod: { enabled: true, amount: '-50' }, declaredValue: '' }), 0);
  });
});

describe('bookingVoucherService — demo/mock only', () => {
  it('validates a known mock code', async () => {
    const result = await voucherService.validateBookingVoucher('sulit10');
    assert.equal(result.valid, true);
    assert.equal(result.code, 'SULIT10');
    assert.equal(result.discountType, 'fixed');
    assert.equal(result.discountValue, 10);
  });

  it('rejects an unknown code with a message, never throwing', async () => {
    const result = await voucherService.validateBookingVoucher('NOT-A-CODE');
    assert.equal(result.valid, false);
    assert.ok(result.message);
  });

  it('caps a fixed discount at the shipping fee it applies to (never negative, never over the fee)', () => {
    const tinyFee = voucherService.computeVoucherDiscount({ valid: true, code: 'GOGO20', discountType: 'fixed', discountValue: 20 }, 15);
    assert.equal(tinyFee, 15);
  });

  it('returns 0 discount for an invalid result', () => {
    const discount = voucherService.computeVoucherDiscount({ valid: false, code: 'X', discountType: 'fixed', discountValue: 20 }, 100);
    assert.equal(discount, 0);
  });
});

describe('serviceabilityService — mock only, NOT production validation', () => {
  it('allows Same-Day/On-Demand for a Metro Manila address', async () => {
    const result = await serviceability.checkServiceability({ address: { province: 'Metro Manila' }, serviceType: 'same_day' });
    assert.equal(result.serviceable, true);
    assert.ok(result.availableServiceTypes.includes('same_day'));
    assert.ok(result.availableServiceTypes.includes('on_demand'));
  });

  it('restricts Same-Day/On-Demand outside Metro Manila, with a reason', async () => {
    const result = await serviceability.checkServiceability({ address: { province: 'Cebu' }, serviceType: 'same_day' });
    assert.deepEqual(result.availableServiceTypes, ['standard']);
    assert.ok(result.reason);
  });

  it('flags an empty address as not serviceable yet', async () => {
    const result = await serviceability.checkServiceability({ address: { province: '' }, serviceType: 'standard' });
    assert.equal(result.serviceable, false);
  });
});

describe('basicPickupScheduling — mock pickup-date scheduling, NOT a real holiday calendar', () => {
  it('isEligiblePickupDay excludes Sundays', () => {
    // 2026-02-08 is a Sunday.
    assert.equal(pickupScheduling.isEligiblePickupDay(new Date(2026, 1, 8)), false);
    // 2026-02-09 is a Monday.
    assert.equal(pickupScheduling.isEligiblePickupDay(new Date(2026, 1, 9)), true);
  });

  it('isEligiblePickupDay excludes every mock holiday', () => {
    for (const iso of pickupScheduling.MOCK_PH_HOLIDAYS_2026) {
      const [y, m, d] = iso.split('-').map(Number);
      assert.equal(pickupScheduling.isEligiblePickupDay(new Date(y, m - 1, d)), false, `${iso} should be excluded`);
    }
  });

  it('getEligiblePickupDates returns exactly `count` ascending eligible dates, skipping Sundays/holidays', () => {
    const dates = pickupScheduling.getEligiblePickupDates(5, 15, new Date(2026, 1, 2, 10)); // Mon Feb 2, 2026, 10am — before cutoff
    assert.equal(dates.length, 5);
    for (let i = 0; i < dates.length; i++) {
      assert.equal(pickupScheduling.isEligiblePickupDay(dates[i]), true);
      if (i > 0) assert.ok(dates[i].getTime() > dates[i - 1].getTime(), 'dates must be strictly ascending');
    }
  });

  it('excludes today once past the mock cutoff hour', () => {
    const withinCutoff = pickupScheduling.getEligiblePickupDates(1, 15, new Date(2026, 1, 2, 10));
    const pastCutoff = pickupScheduling.getEligiblePickupDates(1, 15, new Date(2026, 1, 2, 16));
    assert.equal(withinCutoff[0].getDate(), 2, 'before cutoff, today (Feb 2) should be the first eligible date');
    assert.ok(pastCutoff[0].getTime() > withinCutoff[0].getTime(), 'past cutoff, the first eligible date must be later than today');
  });

  it('estimateDeliveryDateRange derives its day-count from checkoutEstimates.STANDARD_DAY_RANGE, not a second hardcoded table', () => {
    const pickup = new Date(2026, 1, 9); // Monday
    for (const region of Object.keys(checkoutEstimates.STANDARD_DAY_RANGE)) {
      const [minDays, maxDays] = checkoutEstimates.STANDARD_DAY_RANGE[region];
      const range = pickupScheduling.estimateDeliveryDateRange(pickup, 'standard', region);
      const expectedFrom = new Date(pickup); expectedFrom.setDate(expectedFrom.getDate() + minDays);
      const expectedTo = new Date(pickup); expectedTo.setDate(expectedTo.getDate() + maxDays);
      assert.equal(range.from.getTime(), expectedFrom.getTime());
      assert.equal(range.to.getTime(), expectedTo.getTime());
    }
  });

  it('estimateDeliveryDateRange is immediate/same-day for on_demand', () => {
    const pickup = new Date(2026, 1, 9);
    const range = pickupScheduling.estimateDeliveryDateRange(pickup, 'on_demand', 'metro');
    assert.equal(range.from.getTime(), pickup.getTime());
    assert.equal(range.to.getTime(), pickup.getTime());
  });
});
