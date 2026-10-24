import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Readable message from a failed server function call. */
export function errorMessage(e: unknown) {
  return e instanceof Error && e.message
    ? e.message
    : 'Something went wrong — please try again'
}
