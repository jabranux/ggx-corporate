import { useEffect, useRef, useState } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { getAllProvinces, getAllCities, getAllDistricts, type LocationOption } from '../lib/locationApi';
import { Input } from './ui/Input';

/**
 * LocationCascadeFields — province → city → barangay cascade rendered as three
 * labeled form fields (React fragment of divs). Drop-in replacement for manual
 * <Input> province/city/barangay fields in buyer-facing checkout forms.
 *
 * Same cascade rules and API-offline fallback as LocationCascadeCells, but
 * form-shaped instead of table-cell-shaped.
 */

export interface LocationCascadeFieldsProps {
  province: string;
  city: string;
  barangay: string;
  onChange: (province: string, city: string, barangay: string) => void;
  errors?: { province?: boolean; city?: boolean; barangay?: boolean };
}

const selectCls = (err?: boolean) =>
  `flex h-10 w-full appearance-none rounded-lg border bg-white pl-3 pr-10 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${err ? 'border-red-500 focus-visible:ring-red-500' : 'border-gray-300 focus-visible:ring-primary'}`;

function CascadeSelect({ label, value, onChange, disabled, error, children }: {
  label: string;
  value: string;
  onChange: React.ChangeEventHandler<HTMLSelectElement>;
  disabled: boolean;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="relative">
        <select value={value} onChange={onChange} disabled={disabled} className={selectCls(error)}>
          {children}
        </select>
        <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
      </div>
    </div>
  );
}

export function LocationCascadeFields({
  province, city, barangay, onChange, errors,
}: LocationCascadeFieldsProps) {
  const [provinceId, setProvinceId] = useState<number | null>(null);
  const [cityId,     setCityId]     = useState<number | null>(null);
  const [provinces,  setProvinces]  = useState<LocationOption[]>([]);
  const [cities,     setCities]     = useState<LocationOption[]>([]);
  const [districts,  setDistricts]  = useState<LocationOption[]>([]);
  const [loadingP,   setLoadingP]   = useState(true);
  const [loadingC,   setLoadingC]   = useState(false);
  const [loadingD,   setLoadingD]   = useState(false);
  const [apiError,   setApiError]   = useState(false);

  const cityRef = useRef(city); cityRef.current = city;

  useEffect(() => {
    getAllProvinces()
      .then((data) => {
        setProvinces(data);
        const match = data.find((p) => p.name === province);
        if (match) setProvinceId(match.id);
      })
      .catch(() => setApiError(true))
      .finally(() => setLoadingP(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps `provinceId` (and, by cascade, the loaded city/district lists) in
  // sync when `province` changes from OUTSIDE this component's own
  // handleProvince — e.g. a caller prefilling the whole address at once
  // (BookingAddressSection's "Recent Addresses"/"Address Book" shortcuts).
  // Without this, only the display value of the Province select updates
  // (it's a controlled `value={province}` prop) while City/Barangay stay
  // stuck on "Select province first" because their option lists are keyed
  // off internal `provinceId`/`cityId` state that only handleProvince/
  // handleCity update — city/barangay are correct in the parent's state
  // and still save fine, but the dropdowns visually look unfilled.
  useEffect(() => {
    if (!provinces.length) return;
    const match = provinces.find((p) => p.name === province);
    setProvinceId((prev) => {
      const next = match?.id ?? null;
      return prev === next ? prev : next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [province, provinces]);

  const prevProvinceIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!provinceId) { setCities([]); setCityId(null); return; }
    setLoadingC(true);
    setCities([]);
    const isFirstLoad = prevProvinceIdRef.current === null;
    prevProvinceIdRef.current = provinceId;

    getAllCities(provinceId)
      .then((data) => {
        setCities(data);
        if (isFirstLoad) {
          const match = data.find((c) => c.name === cityRef.current);
          if (match) setCityId(match.id);
        } else {
          setCityId(null);
        }
      })
      .catch(() => setApiError(true))
      .finally(() => setLoadingC(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provinceId]);

  useEffect(() => {
    if (!cityId) { setDistricts([]); return; }
    setLoadingD(true);
    setDistricts([]);
    getAllDistricts(cityId)
      .then(setDistricts)
      .catch(() => setApiError(true))
      .finally(() => setLoadingD(false));
  }, [cityId]);

  const handleProvince = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setProvinceId(provinces.find((p) => p.name === name)?.id ?? null);
    onChange(name, '', '');
  };
  const handleCity = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setCityId(cities.find((c) => c.name === name)?.id ?? null);
    onChange(province, name, '');
  };
  const handleBarangay = (e: React.ChangeEvent<HTMLSelectElement>) =>
    onChange(province, city, e.target.value);

  if (apiError) {
    return (
      <>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Province</label>
          <Input value={province} onChange={(e) => onChange(e.target.value, '', '')} placeholder="Province" className={errors?.province ? 'border-red-500' : ''} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">City / Municipality</label>
          <Input value={city} onChange={(e) => onChange(province, e.target.value, '')} placeholder="City / Municipality" className={errors?.city ? 'border-red-500' : ''} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Barangay</label>
          <Input value={barangay} onChange={(e) => onChange(province, city, e.target.value)} placeholder="Barangay" className={errors?.barangay ? 'border-red-500' : ''} />
        </div>
      </>
    );
  }

  return (
    <>
      <CascadeSelect label="Province" value={province} onChange={handleProvince} disabled={loadingP} error={errors?.province}>
        <option value="">{loadingP ? 'Loading…' : 'Select province'}</option>
        {provinces.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
      </CascadeSelect>
      <CascadeSelect label="City / Municipality" value={city} onChange={handleCity} disabled={!province || loadingC} error={errors?.city}>
        <option value="">{loadingC ? 'Loading…' : !province ? 'Select province first' : 'Select city'}</option>
        {cities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
      </CascadeSelect>
      <CascadeSelect label="Barangay" value={barangay} onChange={handleBarangay} disabled={!city || loadingD} error={errors?.barangay}>
        <option value="">{loadingD ? 'Loading…' : !city ? 'Select city first' : 'Select barangay'}</option>
        {districts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
      </CascadeSelect>
    </>
  );
}
