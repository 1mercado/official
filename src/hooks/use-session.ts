import { getRouteApi } from '@tanstack/react-router'

const appRoute = getRouteApi('/_app')

/** Signed-in member, live plan, wallet and site origin loaded by the `/_app` layout. */
export function useSession() {
  return appRoute.useLoaderData()
}
