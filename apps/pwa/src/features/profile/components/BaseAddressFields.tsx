import type { Control } from 'react-hook-form';
import { z } from 'zod';
import { cn } from '@properfy/frontend-standards';
import { AU_STATES, type AuState, type InspectorBaseAddress } from '@properfy/shared';
import { Input } from '@/components/ui/Input';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';

/**
 * The structured base-address form fields, shared by the profile "Base address"
 * card (F01-3) and the day-plan "Start this day from" sheet (F04-3). Built on the
 * shared `inspectorBaseAddressSchema` rules with the per-field "required" messages
 * both screens show. `city` is not a field — it is derived from `suburb` at submit
 * (via {@link toInspectorBaseAddress}). No autocomplete suggestions (F01 D11 / DB4);
 * only the HTML `autocomplete` hints below.
 */
export const baseAddressFieldsSchema = z.object({
  street: z.string().trim().min(1, 'Street is required').max(200),
  number: z.string().trim().max(20),
  complement: z.string().trim().max(200),
  suburb: z.string().trim().min(1, 'Suburb is required').max(100),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.enum(AU_STATES, { errorMap: () => ({ message: 'Select a state' }) })),
  postcode: z.string().trim().min(1, 'Postcode is required').regex(/^\d{4}$/, 'Postcode must be 4 digits'),
});

export type BaseAddressFieldsValues = z.input<typeof baseAddressFieldsSchema>;

export const EMPTY_BASE_ADDRESS_FIELDS: BaseAddressFieldsValues = {
  street: '',
  number: '',
  complement: '',
  suburb: '',
  state: '',
  postcode: '',
};

/** Map validated form values to the API `InspectorBaseAddress` (city = suburb, country AU). */
export function toInspectorBaseAddress(values: BaseAddressFieldsValues): InspectorBaseAddress {
  const suburb = values.suburb.trim();
  return {
    street: values.street.trim(),
    number: values.number.trim() || undefined,
    complement: values.complement.trim() || undefined,
    suburb,
    city: suburb,
    state: values.state.trim().toUpperCase() as AuState,
    postcode: values.postcode.trim(),
    country: 'AU',
  };
}

interface BaseAddressFieldsProps {
  control: Control<BaseAddressFieldsValues>;
}

export function BaseAddressFields({ control }: BaseAddressFieldsProps) {
  return (
    <>
      <FormField
        control={control}
        name="street"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Street</FormLabel>
            <FormControl>
              <Input autoComplete="address-line1" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={control}
          name="number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Number</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="complement"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Unit</FormLabel>
              <FormControl>
                <Input autoComplete="address-line2" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={control}
        name="suburb"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Suburb</FormLabel>
            <FormControl>
              <Input autoComplete="address-level2" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={control}
          name="state"
          render={({ field }) => (
            <FormItem>
              <FormLabel>State</FormLabel>
              <FormControl>
                <select
                  autoComplete="address-level1"
                  className={cn(
                    'flex min-h-touch w-full rounded-btn border border-input bg-card px-3 py-2 text-base text-foreground shadow-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive',
                  )}
                  {...field}
                >
                  <option value="">Select…</option>
                  {AU_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="postcode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Postcode</FormLabel>
              <FormControl>
                <Input inputMode="numeric" autoComplete="postal-code" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  );
}
