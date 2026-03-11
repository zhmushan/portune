export type AuthenticatedUser = {
  email: string
}

export type AuthSessionResponse =
  | {
      authenticated: false
      code?: 'AUTH_FORBIDDEN'
    }
  | {
      authenticated: true
      user: AuthenticatedUser
    }
