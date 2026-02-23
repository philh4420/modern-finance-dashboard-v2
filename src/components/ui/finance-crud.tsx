import * as React from 'react'

import { cn } from '@/lib/utils'

import { Button } from './button'
import { Input } from './input'
import { Label } from './label'
import { Textarea } from './textarea'

const hasLegacyToken = (className: string, token: string) =>
  new RegExp(`(^|\\s)${token}(\\s|$)`).test(className)

const stripLegacyButtonTokens = (className: string) =>
  className
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !['btn', 'btn-primary', 'btn-secondary', 'btn-ghost', 'btn-danger', 'btn--sm'].includes(token))
    .join(' ')

function CrudButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const rawClassName = typeof className === 'string' ? className : ''
  const cleanedClassName = stripLegacyButtonTokens(rawClassName)

  const isPrimary = hasLegacyToken(rawClassName, 'btn-primary')
  const isSecondary = hasLegacyToken(rawClassName, 'btn-secondary')
  const isGhost = hasLegacyToken(rawClassName, 'btn-ghost')
  const isDanger = hasLegacyToken(rawClassName, 'btn-danger')
  const isSmall = hasLegacyToken(rawClassName, 'btn--sm')

  const variant = isDanger
    ? 'destructive'
    : isGhost
      ? 'ghost'
      : isSecondary
        ? 'secondary'
        : 'default'

  return (
    <Button
      {...props}
      variant={variant}
      size={isSmall ? 'sm' : 'default'}
      className={cn(
        'font-semibold',
        isSmall ? 'rounded-[0.78rem]' : 'rounded-[0.88rem]',
        isPrimary &&
          'border-transparent text-primary-foreground [background:var(--fx-primary-gradient)] hover:[background:var(--fx-primary-gradient)]',
        cleanedClassName,
      )}
    />
  )
}

const CrudInput = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(function CrudInput(
  { className, type, ...props },
  ref,
) {
  if (type === 'checkbox' || type === 'radio') {
    return (
      <input
        ref={ref}
        type={type}
        className={cn('accent-[var(--tone-finance)]', className)}
        {...props}
      />
    )
  }

  return (
    <Input
      ref={ref}
      type={type}
      className={cn('fx-field-control h-9 rounded-[0.78rem] shadow-none', className)}
      {...props}
    />
  )
})

const CrudTextarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(function CrudTextarea(
  { className, ...props },
  ref,
) {
  return (
    <Textarea
      ref={ref}
      className={cn('fx-field-control min-h-16 rounded-[0.78rem] shadow-none', className)}
      {...props}
    />
  )
})

const CrudSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(function CrudSelect(
  { className, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn('fx-field-control fx-field-control-select h-10 rounded-[0.9rem]', className)}
      {...props}
    />
  )
})

function CrudLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  const rawClassName = typeof className === 'string' ? className : ''
  const preserveCustomLayout =
    rawClassName.includes('checkbox-row') ||
    rawClassName.includes('cards-') ||
    rawClassName.includes('mobile-edit-field') ||
    rawClassName.includes('form-field') ||
    rawClassName.includes('modal-') ||
    rawClassName.includes('reconcile-')

  return (
    <Label
      className={cn(
        !preserveCustomLayout && 'fx-field-label inline-block leading-tight',
        className,
      )}
      {...props}
    />
  )
}

export { CrudButton, CrudInput, CrudLabel, CrudSelect, CrudTextarea }
