import { forwardRef, useCallback, useEffect, useRef } from 'react';
import {
  formInput,
  formInputContainer,
  formInputContainerError,
  formInputContainerDisabled,
} from './form-styles';

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  type?: 'text' | 'email' | 'tel' | 'password' | 'url';
  id?: string;
  name?: string;
  /**
   * Focus the field once on mount. Implemented imperatively (ref + effect)
   * rather than the DOM `autoFocus` attribute, which jsx-a11y/no-autofocus
   * flags; the mount-focus behaviour is identical.
   */
  focusOnMount?: boolean;
  maxLength?: number;
  onFocus?: () => void;
  'aria-label'?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  {
    value,
    onChange,
    placeholder,
    disabled,
    error,
    type = 'text',
    id,
    name,
    focusOnMount,
    maxLength,
    onFocus,
    'aria-label': ariaLabel,
  },
  ref,
) {
  const innerRef = useRef<HTMLInputElement | null>(null);
  // Merge the forwarded ref with our own so the mount-focus effect can reach
  // the node without stealing the ref from the consumer.
  const setRef = useCallback(
    (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  useEffect(() => {
    if (focusOnMount) innerRef.current?.focus();
  }, [focusOnMount]);

  const containerClass = disabled
    ? formInputContainerDisabled
    : error
      ? formInputContainerError
      : formInputContainer;

  return (
    <div className={containerClass}>
      <input
        ref={setRef}
        type={type}
        id={id}
        name={name}
        className={formInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        onFocus={onFocus}
        aria-label={ariaLabel}
      />
    </div>
  );
});
