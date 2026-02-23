import * as React from 'react'

import { cn } from '@/lib/utils'

function PrintSurface({ className, ...props }: React.ComponentProps<'article'>) {
  return (
    <article
      className={cn('print:break-inside-avoid print:bg-white print:text-black', className)}
      {...props}
    />
  )
}

function PrintTable({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <table
      className={cn(
        'w-full border-collapse align-top print:w-full print:text-[11px] [&_th]:align-top [&_td]:align-top',
        className,
      )}
      {...props}
    />
  )
}

export { PrintSurface, PrintTable }
