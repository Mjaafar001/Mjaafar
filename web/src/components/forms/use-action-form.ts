"use client";
import { useRouter } from "next/navigation";
import { useForm, type DefaultValues, type FieldValues, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import type { ActionResult } from "@/lib/action";

/**
 * React Hook Form + Zod on the client, the same schema re-validated in the server action.
 * Handles toasts, server field errors and refresh.
 */
export function useActionForm<S extends z.ZodType<FieldValues, FieldValues>, R = unknown>(opts: {
  schema: S;
  action: (input: unknown) => Promise<ActionResult<R>>;
  defaultValues: DefaultValues<z.input<S>>;
  onSuccess?: (res: Extract<ActionResult<R>, { ok: true }>) => void;
  refresh?: boolean;
}) {
  const router = useRouter();
  const form = useForm<z.input<S>, unknown, z.output<S>>({
    resolver: zodResolver(opts.schema as never) as unknown as Resolver<z.input<S>, unknown, z.output<S>>,
    defaultValues: opts.defaultValues,
  });
  const onSubmit = form.handleSubmit(async (values) => {
    const res = await opts.action(values);
    if (res.ok) {
      if (res.message) toast.success(res.message);
      opts.onSuccess?.(res);
      if (opts.refresh !== false) router.refresh();
    } else {
      toast.error(res.error);
      if (res.fieldErrors) for (const [k, v] of Object.entries(res.fieldErrors)) form.setError(k as never, { message: v[0] });
    }
  });
  return { form, onSubmit, errors: form.formState.errors, submitting: form.formState.isSubmitting };
}
