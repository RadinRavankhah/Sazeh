import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { AuthFlowError, resetPassword } from "@/lib/auth"
import { PasswordInput } from "@/components/PasswordInput"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"

const resetSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    path: ["confirm"],
    message: "The passwords don't match.",
  })

type ResetValues = z.infer<typeof resetSchema>

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const key = searchParams.get("key")
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirm: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await resetPassword(key ?? "", values.password)
      navigate("/login", { state: { reset: true } })
    } catch (error) {
      if (error instanceof AuthFlowError) {
        setFormError(
          "This reset link is invalid or was already used. Request a new one.",
        )
        return
      }
      throw error
    }
  })

  if (key === null) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Invalid reset link</h1>
        <p className="text-sm text-muted-foreground">
          This link is missing its reset key. Request a fresh one.
        </p>
        <Button variant="outline" size="sm" className="self-start" nativeButton={false} render={<Link to="/forgot-password" />}>
          Request a new link
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">
          Pick something you haven't used elsewhere.
        </p>
      </header>

      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="password">New password</FieldLabel>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              aria-invalid={form.formState.errors.password ? true : undefined}
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <FieldError>{form.formState.errors.password.message}</FieldError>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm">Repeat the new password</FieldLabel>
            <PasswordInput
              id="confirm"
              autoComplete="new-password"
              aria-invalid={form.formState.errors.confirm ? true : undefined}
              {...form.register("confirm")}
            />
            {form.formState.errors.confirm && (
              <FieldError>{form.formState.errors.confirm.message}</FieldError>
            )}
          </Field>
          {formError !== null && <FieldError>{formError}</FieldError>}
          <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
            {form.formState.isSubmitting && <Spinner data-icon="inline-start" />}
            Set new password
          </Button>
        </FieldGroup>
      </form>
    </div>
  )
}
