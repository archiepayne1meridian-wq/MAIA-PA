import { proxy } from './proxy'

export const middleware = proxy

// Must be defined inline here — Next.js static analysis cannot follow re-exports.
// Guards /dashboard/* only. Login, API, and all other routes are unprotected.
export const config = {
  matcher: ['/dashboard/:path*'],
}
