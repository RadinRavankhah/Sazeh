import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { AuthFlowError, signup } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

const signupSchema = z
  .object({
    email: z.string().email("Enter a valid email address."),
    password: z.string().min(8, "Use at least 8 characters."),
  })
  .refine((v) => v.password.toLowerCase() !== v.email.toLowerCase(), {
    message: "Password must not be your email address.",
    path: ["password"],
  })

type SignupValues = z.infer<typeof signupSchema>

export function SignupPage() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await signup(values.email, values.password)
      await navigate("/", { replace: true })
    } catch (error) {
      if (error instanceof AuthFlowError) {
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          form.setError(field as keyof SignupValues, { message })
        }
        if (Object.keys(error.fieldErrors).length === 0) setFormError(error.message)
      } else {
        setFormError("Could not reach the server. Try again.")
      }
    }
  })

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          One account, one personal workspace — your first site is minutes away.
        </p>
      </header>

      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          {formError !== null && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
          <Field data-invalid={form.formState.errors.email ? true : undefined}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={form.formState.errors.email ? true : undefined}
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <FieldError>{form.formState.errors.email.message}</FieldError>
            )}
          </Field>
          <Field data-invalid={form.formState.errors.password ? true : undefined}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={form.formState.errors.password ? true : undefined}
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <FieldError>{form.formState.errors.password.message}</FieldError>
            )}
            {!form.formState.errors.password && (
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            )}
          </Field>
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? (
              <>
                <Spinner data-icon="inline-start" />
                Creating account…
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </FieldGroup>
      </form>

      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
          Log in
        </Link>
      </p>
    </div>
  )
}
