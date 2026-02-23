import * as React from 'react'

import { cn } from '@/lib/utils'

import { Badge } from './badge'
import { Card } from './card'
import { Table } from './table'

function SurfaceCard({ className, ...props }: React.ComponentProps<typeof Card>) {
  return <Card className={cn('gap-0 py-0', className)} {...props} />
}

function DataTable({ className, ...props }: React.ComponentProps<typeof Table>) {
  return <Table className={cn(className)} {...props} />
}

function PillBadge({
  className,
  variant = 'outline',
  ...props
}: React.ComponentProps<typeof Badge>) {
  return (
    <Badge
      variant={variant}
      className={cn('align-middle whitespace-nowrap', className)}
      {...props}
    />
  )
}

export { SurfaceCard, DataTable, PillBadge }
