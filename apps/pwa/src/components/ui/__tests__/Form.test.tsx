import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '../Form';
import { Input } from '../Input';

const schema = z.object({ email: z.string().email('Enter a valid email') });

function Example({ onValid }: { onValid?: (v: { email: string }) => void }) {
  const form = useForm<{ email: string }>({ resolver: zodResolver(schema), defaultValues: { email: '' } });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => onValid?.(v))}>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="you@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <button type="submit">Submit</button>
      </form>
    </Form>
  );
}

describe('Form kit', () => {
  it('associates the label with the control', () => {
    render(<Example />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('shows a validation message and marks the field invalid on bad submit', async () => {
    const onValid = vi.fn();
    render(<Example onValid={onValid} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(onValid).not.toHaveBeenCalled();
  });

  it('submits parsed values when valid', async () => {
    const onValid = vi.fn();
    render(<Example onValid={onValid} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(onValid).toHaveBeenCalledWith({ email: 'a@b.com' }));
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'false');
  });
});
