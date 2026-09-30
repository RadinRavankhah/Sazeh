import { useState } from "react"
import { Link } from "react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { AuthFlowError, requestPasswordReset } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

const forgotSchema = z.object({
  email: z.string().email("Enter a valid email address."),
})

type ForgotValues = z.infer<typeof forgotSchema>

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await requestPasswordReset(values.email)
      setSentTo(values.email)
    } catch (error) {
      if (error instanceof AuthFlowError) {
        form.setError("email", { message: error.message })
        return
      }
      throw error
    }
  })

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          Enter the email you signed up with and we'll send you a reset link.
        </p>
      </header>

      {sentTo !== null ? (
        <div className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <p className="text-sm">
            Check <span className="font-medium">{sentTo}</span> — the reset link
            is on its way. It can only be used once.
          </p>
          <p className="text-xs text-muted-foreground">
            Running the backend locally? The email prints to the runserver
            terminal (console email backend).
          </p>
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            nativeButton={false}
            render={<Link to="/login" />}
          >
            Back to login
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                aria-invalid={form.formState.errors.email ? true : undefined}
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <FieldError>{form.formState.errors.email.message}</FieldError>
              )}
            </Field>
            <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
              {form.formState.isSubmitting && <Spinner data-icon="inline-start" />}
              Send reset link
            </Button>
          </FieldGroup>
        </form>
      )}

      <p className="text-sm text-muted-foreground">
        Remembered it after all?{" "}
        <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
          Log in
        </Link>
      </p>
    </div>
  )
}
